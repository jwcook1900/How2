import { DynamoDBClient, ScanCommand, PutItemCommand, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID, createPublicKey, verify as cryptoVerify } from "crypto";
import { sendEmail } from "../shared/sendEmail";

const ddb = new DynamoDBClient({});
const HEADERS = { "content-type": "application/json" };

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function json(statusCode: number, body: any) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function b64urlJson(seg: string): any {
  return JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

// Verify the caller's Cognito ID token against the user pool's JWKS and return
// their `sub`. Scope-independent (no reliance on a Cognito API), so it works
// regardless of the token's OAuth scopes. Returns "" if invalid/expired.
let jwksCache: any[] | null = null;
async function getJwks(): Promise<any[] | null> {
  if (jwksCache) return jwksCache;
  const region = process.env.AWS_REGION || "";
  const pool = process.env.USER_POOL_ID || "";
  if (!region || !pool) return null;
  try {
    const res = await fetch("https://cognito-idp." + region + ".amazonaws.com/" + pool + "/.well-known/jwks.json");
    if (!res.ok) return null;
    const j: any = await res.json();
    jwksCache = (j && j.keys) || [];
    return jwksCache;
  } catch (e) { return null; }
}
async function callerSub(idToken: string): Promise<string> {
  try {
    if (!idToken) return "";
    const parts = String(idToken).split(".");
    if (parts.length !== 3) return "";
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    const region = process.env.AWS_REGION || "";
    const pool = process.env.USER_POOL_ID || "";
    if (payload.iss !== "https://cognito-idp." + region + ".amazonaws.com/" + pool) return "";
    if (payload.token_use !== "id") return "";
    if (!payload.exp || payload.exp * 1000 < Date.now()) return "";
    if (!payload.sub) return "";
    const keys = await getJwks();
    if (!keys) return "";
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) return "";
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const ok = cryptoVerify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), pub, sig);
    return ok ? String(payload.sub) : "";
  } catch (e) { return ""; }
}

export const handler = async (event: any) => {
  try {
    if (event?.requestContext?.http?.method === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
    let raw = event && event.body;
    if (event && event.isBase64Encoded && raw) raw = Buffer.from(raw, "base64").toString("utf8");
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch (e) { body = {}; }
    const action = String(body.action || "submit");
    const fbTable = process.env.GUIDEFEEDBACK_TABLE;

    // ---- Dashboard: list the caller's suggestions ----
    if (action === "list") {
      const sub = await callerSub(String(body.idToken || ""));
      if (!sub || !fbTable) return json(200, { items: [] });
      const items: any[] = [];
      let startKey: Record<string, any> | undefined = undefined;
      do {
        const res: any = await ddb.send(new ScanCommand({
          TableName: fbTable,
          FilterExpression: "ownerSub = :s",
          ExpressionAttributeValues: { ":s": { S: sub } },
          ExclusiveStartKey: startKey,
        }));
        for (const it of res.Items || []) {
          items.push({
            id: it.id?.S || "",
            slug: it.slug?.S || "",
            title: it.title?.S || "",
            message: it.message?.S || "",
            fromEmail: it.fromEmail?.S || "",
            createdAt: it.createdAt?.S || "",
          });
        }
        startKey = res.LastEvaluatedKey;
      } while (startKey);
      items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return json(200, { items });
    }

    // ---- Dashboard: the caller's own per-guide analytics ----
    // Verifies the caller, finds the slugs they own (SavedGuide), then tallies
    // view/share events for just those guides, bucketing views into the
    // caller's local days (tz = minutes, as Date.getTimezoneOffset() reports).
    if (action === "stats") {
      const sub = await callerSub(String(body.idToken || ""));
      const sgT = process.env.SAVEDGUIDE_TABLE;
      const evT = process.env.EVENT_TABLE;
      if (!sub || !sgT || !evT) return json(200, { ok: false, guides: {} });
      const tz = Math.max(-840, Math.min(840, Number(body.tz) || 0));
      const localDay = (iso: string) => {
        const t = Date.parse(iso);
        return isNaN(t) ? "" : new Date(t - tz * 60000).toISOString().slice(0, 10);
      };
      // Which slugs are mine? (ownerSub, falling back to Amplify's owner field
      // for rows saved before ownerSub existed.)
      const mine = new Set<string>();
      let sk: Record<string, any> | undefined = undefined;
      do {
        const res: any = await ddb.send(new ScanCommand({
          TableName: sgT,
          ProjectionExpression: "slug, ownerSub, #o",
          ExpressionAttributeNames: { "#o": "owner" },
          ExclusiveStartKey: sk,
        }));
        for (const it of res.Items || []) {
          const os = (it.ownerSub && it.ownerSub.S) ||
            ((it.owner && it.owner.S) ? it.owner.S.split("::")[0] : "");
          if (os === sub && it.slug && it.slug.S) mine.add(it.slug.S);
        }
        sk = res.LastEvaluatedKey;
      } while (sk);
      if (!mine.size) return json(200, { ok: true, guides: {} });

      const DAYS = 14;
      const days: string[] = [];
      for (let i = DAYS - 1; i >= 0; i--) {
        days.push(new Date(Date.now() - tz * 60000 - i * 86400000).toISOString().slice(0, 10));
      }
      const agg: Record<string, {
        views: number; shares: number; uniq: Set<string>;
        daily: Record<string, number>; dailyU: Record<string, Set<string>>;
        refs: Record<string, number>;
      }> = {};
      sk = undefined;
      do {
        const res: any = await ddb.send(new ScanCommand({
          TableName: evT,
          ProjectionExpression: "#k, slug, createdAt, vid, #r",
          ExpressionAttributeNames: { "#k": "kind", "#r": "ref" },
          ExclusiveStartKey: sk,
        }));
        for (const it of res.Items || []) {
          const evSlug = (it.slug && it.slug.S) || "";
          if (!mine.has(evSlug)) continue;
          const kind = (it.kind && it.kind.S) || "";
          const a = agg[evSlug] ||
            (agg[evSlug] = { views: 0, shares: 0, uniq: new Set(), daily: {}, dailyU: {}, refs: {} });
          if (kind === "view") {
            a.views++;
            const vid = (it.vid && it.vid.S) || "";
            if (vid) a.uniq.add(vid);
            // Traffic source: referrer domain or "direct" (absent on events
            // from before ref tracking shipped — those aren't counted).
            const ref = (it.ref && it.ref.S) || "";
            if (ref) a.refs[ref] = (a.refs[ref] || 0) + 1;
            const d = localDay((it.createdAt && it.createdAt.S) || "");
            if (d) {
              a.daily[d] = (a.daily[d] || 0) + 1;
              if (vid) (a.dailyU[d] || (a.dailyU[d] = new Set())).add(vid);
            }
          } else if (kind === "share") a.shares++;
        }
        sk = res.LastEvaluatedKey;
      } while (sk);

      const guides: Record<string, any> = {};
      for (const gSlug of Object.keys(agg)) {
        const a = agg[gSlug];
        const daily = days.map((d) => ({
          d, v: a.daily[d] || 0, u: a.dailyU[d] ? a.dailyU[d].size : 0,
        }));
        const week = daily.slice(-7).reduce((s, x) => s + x.v, 0);
        // unique counts only events that carried a visitor id (older ones
        // don't), so it's a floor for historical data and exact from now on.
        const refs = Object.fromEntries(
          Object.entries(a.refs).sort((x, y) => y[1] - x[1]).slice(0, 5));
        guides[gSlug] = { views: a.views, unique: a.uniq.size, shares: a.shares, week, daily, refs };
      }
      return json(200, { ok: true, guides });
    }

    // ---- Dashboard: dismiss one of the caller's suggestions ----
    if (action === "dismiss") {
      const sub = await callerSub(String(body.idToken || ""));
      const id = String(body.id || "");
      if (!sub || !id || !fbTable) return json(200, { ok: false });
      const got: any = await ddb.send(new GetItemCommand({ TableName: fbTable, Key: { id: { S: id } } }));
      if (got.Item && got.Item.ownerSub && got.Item.ownerSub.S === sub) {
        await ddb.send(new DeleteItemCommand({ TableName: fbTable, Key: { id: { S: id } } }));
      }
      return json(200, { ok: true });
    }

    // ---- Sitter: submit feedback on a published guide (default) ----
    const slug = String(body.slug || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 4000);
    const title = String(body.title || "a guide").slice(0, 200);
    const fromEmail = String(body.email || "").trim().slice(0, 200);
    if (!message) return json(400, { error: "empty" });

    const from = process.env.EMAIL_FROM || process.env.SES_FROM;
    const fallback = process.env.FEEDBACK_TO || "hello@gotitguides.com";
    if (!from) return json(503, { error: "not configured" });

    // Look up the guide's owner (server-side; never exposed to the client).
    let to = fallback;
    let toOwner = false;
    let ownerSub = "";
    const sgTable = process.env.SAVEDGUIDE_TABLE;
    if (sgTable && /^[a-z0-9-]{1,80}$/.test(slug)) {
      try {
        let startKey: Record<string, any> | undefined = undefined;
        do {
          const res: any = await ddb.send(new ScanCommand({
            TableName: sgTable,
            FilterExpression: "slug = :s",
            ExpressionAttributeValues: { ":s": { S: slug } },
            ProjectionExpression: "ownerEmail, ownerSub, #o",
            ExpressionAttributeNames: { "#o": "owner" },
            ExclusiveStartKey: startKey,
          }));
          for (const item of res.Items || []) {
            const oe = item.ownerEmail && item.ownerEmail.S;
            if (oe && EMAIL_RE.test(oe)) {
              to = oe; toOwner = true;
              // Prefer the explicit ownerSub; fall back to the sub embedded in
              // Amplify's owner field ("<sub>::<username>") so guides saved
              // before ownerSub existed still route to the dashboard.
              ownerSub = (item.ownerSub && item.ownerSub.S) ||
                ((item.owner && item.owner.S) ? item.owner.S.split("::")[0] : "");
              break;
            }
          }
          startKey = toOwner ? undefined : res.LastEvaluatedKey;
        } while (startKey);
      } catch (e) { /* fall back to the team inbox */ }
    }

    const replyOk = !!fromEmail && EMAIL_RE.test(fromEmail) && !/[\r\n]/.test(fromEmail);

    // Store it on the creator's dashboard (matched by their Cognito sub).
    let savedToDashboard = false;
    if (toOwner && ownerSub && fbTable) {
      const now = new Date().toISOString();
      const item: Record<string, any> = {
        id: { S: randomUUID() },
        __typename: { S: "GuideFeedback" },
        ownerSub: { S: ownerSub },
        slug: { S: slug },
        title: { S: title },
        message: { S: message },
        createdAt: { S: now },
        updatedAt: { S: now },
      };
      if (replyOk) item.fromEmail = { S: fromEmail };
      try { await ddb.send(new PutItemCommand({ TableName: fbTable, Item: item })); savedToDashboard = true; } catch (e) { /* email still sent */ }
    }

    const base = (process.env.APP_BASE_URL || "https://www.gotitguides.com").replace(/\/+$/, "");
    const link = base + "/g/" + encodeURIComponent(slug);

    const text =
      'New feedback on your guide "' + title + '"\n\n' + message + "\n\n—\n" +
      "From: " + (replyOk ? fromEmail : "(not provided)") + "\n" +
      "Guide: " + link +
      (toOwner ? "" : "\n(No account linked to this guide — sent to the team inbox.)");

    const html =
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
      '<h2 style="font-size:18px;margin:0 0 4px">New feedback on your guide</h2>' +
      '<p style="color:#777;margin:0 0 14px">' + esc(title) + "</p>" +
      '<p style="white-space:pre-wrap;background:#F7F7F7;padding:14px 16px;border-radius:8px;margin:0 0 16px">' +
      esc(message) + "</p>" +
      '<p style="margin:4px 0;color:#555"><strong>From:</strong> ' + (replyOk ? esc(fromEmail) : "(not provided)") + "</p>" +
      '<p style="margin:4px 0;color:#555"><strong>Guide:</strong> <a href="' + esc(link) + '">' + esc(link) + "</a></p>" +
      "</div>";

    await sendEmail({
      from,
      to,
      subject: toOwner ? "Feedback on your guide: " + title : "Guide feedback (" + slug + ")",
      text,
      html,
      replyTo: replyOk ? fromEmail : undefined,
    });
    return json(200, { ok: true, savedToDashboard });
  } catch (e) {
    return json(500, { error: "failed" });
  }
};
