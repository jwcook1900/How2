import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { DynamoDBClient, ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const ddb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const JSON_HEADERS = { "content-type": "application/json" };
const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---- unsubscribe-link signing (HMAC over the lowercased address) ---- */

function sig(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}
function sigOk(email: string, s: string, secret: string): boolean {
  const want = Buffer.from(sig(email, secret));
  const got = Buffer.from(String(s || ""));
  return want.length === got.length && timingSafeEqual(want, got);
}
function b64u(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): string {
  return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/* ---- audience ---- */

interface Audience {
  accounts: number;
  waitlist: number;
  unsubscribed: number;
  recipients: string[];                              // deduped, lowercased, unsubs removed
  sources: { email: string; src: string }[];         // same set, labelled for the picker UI
}

async function gatherAudience(): Promise<Audience> {
  const emails = new Map<string, string>(); // email -> "account" | "waitlist"
  let accounts = 0, waitlist = 0;

  // Account holders, straight from the user pool.
  const poolId = process.env.USER_POOL_ID;
  if (poolId) {
    let token: string | undefined = undefined;
    do {
      const res: any = await cognito.send(new ListUsersCommand({
        UserPoolId: poolId, Limit: 60, PaginationToken: token,
      }));
      for (const u of res.Users || []) {
        const attr = (u.Attributes || []).find((a: any) => a.Name === "email");
        const e = (attr && attr.Value || "").trim().toLowerCase();
        if (EMAIL_RE.test(e) && !emails.has(e)) { emails.set(e, "account"); accounts++; }
      }
      token = res.PaginationToken;
    } while (token);
  }

  // Waitlist signups + unsubscribes, both stored as Feedback rows.
  const unsubs = new Set<string>();
  const table = process.env.FEEDBACK_TABLE;
  if (table) {
    let startKey: Record<string, any> | undefined = undefined;
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: table,
        // "context" is a DynamoDB reserved word — alias both to be safe.
        ProjectionExpression: "#e, #c",
        ExpressionAttributeNames: { "#e": "email", "#c": "context" },
        ExclusiveStartKey: startKey,
      }));
      for (const item of res.Items || []) {
        const ctx = (item.context && item.context.S) || "";
        const e = ((item.email && item.email.S) || "").trim().toLowerCase();
        if (!EMAIL_RE.test(e)) continue;
        if (ctx === "unsub") unsubs.add(e);
        else if (ctx === "waitlist" && !emails.has(e)) { emails.set(e, "waitlist"); waitlist++; }
      }
      startKey = res.LastEvaluatedKey;
    } while (startKey);
  }

  const recipients = Array.from(emails.keys()).filter((e) => !unsubs.has(e));
  const sources = recipients.map((e) => ({ email: e, src: emails.get(e) || "" }));
  return { accounts, waitlist, unsubscribed: unsubs.size, recipients, sources };
}

/* ---- email rendering ---- */

// Plain text -> simple branded HTML: escaped, blank-line paragraphs, bare
// http(s) URLs made clickable. No markdown, no images.
function bodyHtml(body: string): string {
  return String(body).trim().split(/\n{2,}/).map((para) => {
    const lines = para.split("\n").map((line) =>
      esc(line).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#D65F33">$1</a>')
    );
    return '<p style="margin:0 0 16px;line-height:1.6">' + lines.join("<br />") + "</p>";
  }).join("");
}

function renderEmail(subject: string, body: string, unsubUrl: string) {
  const footerText =
    "\n\n—\nYou're getting this because you have a GotIt Guides account or joined the waitlist." +
    "\nGotIt Guides · Made in Sydney, Australia · hello@gotitguides.com" +
    "\nUnsubscribe: " + unsubUrl;
  const text = String(body).trim() + footerText;
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">' +
    '<p style="font-size:17px;font-weight:800;margin:0 0 20px">GotIt Guides<span style="color:#ED7446">.</span></p>' +
    bodyHtml(body) +
    '<hr style="border:none;border-top:1px solid #eee;margin:28px 0 14px" />' +
    '<p style="color:#999;font-size:12px;line-height:1.6;margin:0">' +
    "You're getting this because you have a GotIt Guides account or joined the waitlist.<br />" +
    "GotIt Guides · Made in Sydney, Australia · " +
    '<a href="mailto:hello@gotitguides.com" style="color:#999">hello@gotitguides.com</a> · ' +
    '<a href="' + esc(unsubUrl) + '" style="color:#999">Unsubscribe</a></p>' +
    "</div>";
  return { subject, text, html };
}

/* ---- sending (Resend batch endpoint, personalised unsub link per email) ---- */

async function sendBatch(items: any[]): Promise<{ sent: number; failed: number }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("email not configured");
  let sent = 0, failed = 0;
  for (let i = 0; i < items.length; i += 80) {
    const chunk = items.slice(i, i + 80);
    const resp = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify(chunk),
    });
    if (resp.ok) sent += chunk.length; else failed += chunk.length;
  }
  return { sent, failed };
}

/* ---- unsubscribe endpoint ---- */

const UNSUB_PAGE = (msg: string) =>
  "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
  "<title>GotIt Guides</title></head>" +
  "<body style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FAFAF8;color:#1A1A1A;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0'>" +
  "<div style='text-align:center;padding:24px;max-width:420px'>" +
  "<p style='font-size:20px;font-weight:800'>GotIt Guides<span style='color:#ED7446'>.</span></p>" +
  "<p style='font-size:16px;line-height:1.6'>" + msg + "</p>" +
  "<p style='margin-top:22px'><a href='https://www.gotitguides.com' style='color:#D65F33'>gotitguides.com</a></p>" +
  "</div></body></html>";

async function handleUnsub(qs: Record<string, string>, secret: string) {
  const email = unb64u(qs.e || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || !sigOk(email, qs.s || "", secret)) {
    return { statusCode: 400, headers: HTML_HEADERS, body: UNSUB_PAGE("That unsubscribe link isn't valid — it may have been cut short by your email app. Reply to any of our emails and we'll take you off the list by hand.") };
  }
  const table = process.env.FEEDBACK_TABLE;
  if (table) {
    const now = new Date().toISOString();
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: {
        id: { S: randomUUID() },
        message: { S: "Unsubscribed from email updates" },
        email: { S: email },
        context: { S: "unsub" },
        createdAt: { S: now },
        updatedAt: { S: now },
        __typename: { S: "Feedback" },
      },
    }));
  }
  return { statusCode: 200, headers: HTML_HEADERS, body: UNSUB_PAGE("You're unsubscribed — no more product updates from us. Your guides are untouched and your links keep working.") };
}

/* ---- main ---- */

export const handler = async (event: any) => {
  try {
    const http = (event && event.requestContext && event.requestContext.http) || {};
    const secret = process.env.STATS_KEY || "";

    if (http.method === "OPTIONS") return { statusCode: 204, headers: JSON_HEADERS, body: "" };

    // Public unsubscribe link (GET, HMAC-verified — no passphrase involved).
    if (http.method === "GET" && /\/unsub$/.test(http.path || event.rawPath || "")) {
      if (!secret) return { statusCode: 503, headers: HTML_HEADERS, body: UNSUB_PAGE("Not configured.") };
      return await handleUnsub(event.queryStringParameters || {}, secret);
    }

    // Everything else is the passphrase-protected admin API.
    let raw = event && event.body;
    if (event && event.isBase64Encoded && raw) raw = Buffer.from(raw, "base64").toString("utf8");
    let b: any = {};
    try { b = JSON.parse(raw || "{}"); } catch (e) { b = {}; }

    if (!secret) return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: "not configured" }) };
    if ((b.key || "").trim() !== secret) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: "wrong passphrase" }) };
    }

    const origin = "https://" + ((event.requestContext && event.requestContext.domainName) || "");
    const unsubUrl = (email: string) => origin + "/unsub?e=" + b64u(email) + "&s=" + sig(email, secret);
    const from = process.env.EMAIL_FROM || "";

    if (b.action === "audience") {
      const a = await gatherAudience();
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({
        accounts: a.accounts, waitlist: a.waitlist,
        unsubscribed: a.unsubscribed, total: a.recipients.length,
        // Full labelled list for the recipient picker (admin-only endpoint).
        emails: a.sources,
      }) };
    }

    const subject = String(b.subject || "").trim().slice(0, 200);
    const body = String(b.body || "").trim().slice(0, 20000);
    if (!subject || !body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "subject and body are required" }) };
    }
    if (!from) return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: "sender not configured" }) };

    if (b.action === "test") {
      const to = String(b.to || "").trim().toLowerCase();
      if (!EMAIL_RE.test(to)) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "enter a valid test address" }) };
      }
      const m = renderEmail(subject, body, unsubUrl(to));
      const r = await sendBatch([{ from, to: [to], subject: "[TEST] " + m.subject, text: m.text, html: m.html }]);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ sent: r.sent, failed: r.failed }) };
    }

    if (b.action === "send") {
      const a = await gatherAudience();
      // Optional subset: only send to the picked addresses. Always intersected
      // with the live audience, so a stale/typoed list can't email anyone who
      // isn't (still) a consenting recipient.
      let recipients = a.recipients;
      if (Array.isArray(b.only)) {
        const picked = new Set(b.only.map((e: any) => String(e || "").trim().toLowerCase()));
        recipients = recipients.filter((e) => picked.has(e));
        if (!recipients.length) {
          return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "none of the selected recipients are in the audience" }) };
        }
      }
      if (!recipients.length) {
        return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ sent: 0, failed: 0, total: 0 }) };
      }
      const items = recipients.map((to) => {
        const m = renderEmail(subject, body, unsubUrl(to));
        return { from, to: [to], subject: m.subject, text: m.text, html: m.html };
      });
      const r = await sendBatch(items);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ sent: r.sent, failed: r.failed, total: recipients.length }) };
    }

    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "unknown action" }) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
