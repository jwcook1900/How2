/* ============================================================
   Guide writes, authorised server-side (Lambda Function URL).

   POST JSON, one of:
     { action:"create", slug, token, payload, hasViewerLogs? }
     { action:"update", slug, token, payload, hasViewerLogs? }
     { action:"verify", slug, token }              → { ok, payload }
     { action:"log",    slug, logId, entry }       → plaintext guides
     { action:"log",    slug, envelope }           → locked guides

   Security model:
   - The edit token is verified here, against a SHA-256 hash stored in an
     attribute (`tokenHash`) that the public GraphQL schema does not expose.
     Legacy records that still hold a plaintext `editToken` attribute are
     verified against it and migrated to the hash on their next update.
   - "log" lets a viewer append ONE entry to a log the owner made writable —
     for plaintext guides the append happens (and is validated) here; for
     locked guides the server can't see inside the envelope, so a re-encrypted
     envelope is accepted only when the owner's last authorised write declared
     the guide has viewer-writable logs (`viewerLogs`).
   - Every action is rate-limited per IP (a DynamoDB counter with TTL).
   ============================================================ */
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash, timingSafeEqual } from "node:crypto";

const ddb = new DynamoDBClient({});

const MAX_PAYLOAD = 400000; // chars — matches the client's storable budget
const MAX_LOG_FIELD = 500;  // chars per log entry field
const MAX_LOG_ROWS = 1000;

const HEADERS = { "content-type": "application/json" };
const res = (status: number, body: unknown) => ({
  statusCode: status,
  headers: HEADERS,
  body: JSON.stringify(body),
});

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
function tokenMatches(item: Record<string, any>, token: string): boolean {
  if (typeof item.tokenHash === "string" && item.tokenHash) {
    return safeEq(item.tokenHash, sha256(token));
  }
  // Legacy record (written before server-side auth): plaintext token attribute.
  if (typeof item.editToken === "string" && item.editToken) {
    return safeEq(item.editToken, token);
  }
  return false;
}

// The payload is stored as a JSON string. A locked guide is the envelope
// { enc:1, slug, salt, iv, ct }; anything else is the plaintext guide object.
function parsePayload(s: string): any | null {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}
function isEnvelope(o: any): boolean {
  return !!(o && o.enc === 1 && typeof o.ct === "string" &&
    typeof o.salt === "string" && typeof o.iv === "string");
}
function hasWritableLogs(guide: any): boolean {
  return Array.isArray(guide && guide.logs) &&
    guide.logs.some((l: any) => l && !l.ownerOnly);
}

// Per-IP, per-minute counter with a TTL so rows clean themselves up.
// Fails open: a limiter hiccup must never take publishing down with it.
async function overLimit(kind: string, ip: string, limit: number): Promise<boolean> {
  const table = process.env.RATE_TABLE;
  if (!table || !ip) return false;
  try {
    const minute = Math.floor(Date.now() / 60000);
    const out = await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ k: kind + ":" + ip + ":" + minute }),
      UpdateExpression: "ADD n :one SET #e = :exp",
      ExpressionAttributeNames: { "#e": "exp" },
      ExpressionAttributeValues: marshall({
        ":one": 1,
        ":exp": Math.floor(Date.now() / 1000) + 120,
      }),
      ReturnValues: "UPDATED_NEW",
    }));
    const n = out.Attributes ? Number(unmarshall(out.Attributes).n) : 0;
    return n > limit;
  } catch {
    return false;
  }
}

async function getGuideItem(slug: string): Promise<Record<string, any> | null> {
  const out = await ddb.send(new GetItemCommand({
    TableName: process.env.GUIDE_TABLE!,
    Key: marshall({ id: slug }),
  }));
  return out.Item ? unmarshall(out.Item) : null;
}

export const handler = async (event: any) => {
  if ((event.requestContext?.http?.method || "POST") === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }
  let body: any = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return res(400, { error: "Bad request" });
  }
  const ip = event.requestContext?.http?.sourceIp || "";
  const action = String(body.action || "");
  const slug = String(body.slug || "");
  const token = typeof body.token === "string" ? body.token : "";

  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) return res(400, { error: "Bad link name" });

  const now = new Date().toISOString();
  const table = process.env.GUIDE_TABLE;
  if (!table) return res(500, { error: "Not configured" });

  /* ---------- create / update ---------- */
  if (action === "create" || action === "update") {
    if (await overLimit("w", ip, action === "create" ? 10 : 30)) {
      return res(429, { error: "Too many requests — try again in a minute." });
    }
    if (token.length < 10 || token.length > 128) return res(403, { error: "Not allowed" });
    const payload = typeof body.payload === "string" ? body.payload : "";
    if (!payload || payload.length > MAX_PAYLOAD) return res(400, { error: "Bad payload" });
    const parsed = parsePayload(payload);
    if (!parsed) return res(400, { error: "Bad payload" });
    // Whether viewers may write log entries: computed here for plaintext
    // guides; for locked guides the server can't see inside, so the owner's
    // (verified) client declares it.
    const viewerLogs = isEnvelope(parsed) ? !!body.hasViewerLogs : hasWritableLogs(parsed);

    if (action === "create") {
      try {
        await ddb.send(new PutItemCommand({
          TableName: table,
          Item: marshall({
            id: slug,
            payload,
            tokenHash: sha256(token),
            viewerLogs,
            createdAt: now,
            updatedAt: now,
            __typename: "Guide",
          }),
          ConditionExpression: "attribute_not_exists(id)",
        }));
      } catch (e: any) {
        if (e && e.name === "ConditionalCheckFailedException") {
          return res(409, { error: "That link name is taken." });
        }
        throw e;
      }
      return res(200, { ok: true });
    }

    // update
    const item = await getGuideItem(slug);
    if (!item) return res(404, { error: "Guide not found" });
    if (!tokenMatches(item, token)) return res(403, { error: "Not allowed" });
    // Full put: migrates legacy records (plaintext editToken attribute is
    // dropped; tokenHash written) as a side effect of the first real save.
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: marshall({
        id: slug,
        payload,
        tokenHash: sha256(token),
        viewerLogs,
        createdAt: item.createdAt || now,
        updatedAt: now,
        __typename: "Guide",
      }),
    }));
    return res(200, { ok: true });
  }

  /* ---------- verify (edit-link sign-in) ---------- */
  if (action === "verify") {
    if (await overLimit("v", ip, 30)) {
      return res(429, { error: "Too many requests — try again in a minute." });
    }
    const item = await getGuideItem(slug);
    if (!item) return res(404, { error: "Guide not found" });
    if (!token || !tokenMatches(item, token)) return res(200, { ok: false });
    return res(200, { ok: true, payload: item.payload });
  }

  /* ---------- log (viewer appends one entry) ---------- */
  if (action === "log") {
    if (await overLimit("l", ip, 20)) {
      return res(429, { error: "Too many requests — try again in a minute." });
    }
    const item = await getGuideItem(slug);
    if (!item || typeof item.payload !== "string") return res(404, { error: "Guide not found" });
    const current = parsePayload(item.payload);
    if (!current) return res(500, { error: "Guide unreadable" });

    if (isEnvelope(current)) {
      // Locked guide: accept a re-encrypted envelope, but only when the
      // owner's last authorised write said viewers may add log entries.
      // (Records from before this flag existed have no tokenHash either —
      // allow those until the owner's next save stamps the flag.)
      const legacy = !item.tokenHash;
      if (item.viewerLogs !== true && !legacy) return res(403, { error: "Log is read-only" });
      const envStr = typeof body.envelope === "string" ? body.envelope : "";
      if (!envStr || envStr.length > MAX_PAYLOAD) return res(400, { error: "Bad payload" });
      const env = parsePayload(envStr);
      if (!isEnvelope(env)) return res(400, { error: "Bad payload" });
      await ddb.send(new UpdateItemCommand({
        TableName: table,
        Key: marshall({ id: slug }),
        UpdateExpression: "SET payload = :p, updatedAt = :t",
        ExpressionAttributeValues: marshall({ ":p": envStr, ":t": now }),
      }));
      return res(200, { ok: true });
    }

    // Plaintext guide: the append happens here, validated.
    const logId = String(body.logId || "");
    const entry = body.entry || {};
    const when = typeof entry.when === "string" ? entry.when.slice(0, MAX_LOG_FIELD) : "";
    const note = typeof entry.note === "string" ? entry.note.slice(0, MAX_LOG_FIELD) : "";
    if (!logId || (!when && !note)) return res(400, { error: "Bad entry" });
    const log = (Array.isArray(current.logs) ? current.logs : [])
      .find((l: any) => l && l.id === logId);
    if (!log) return res(404, { error: "Log not found" });
    if (log.ownerOnly) return res(403, { error: "Log is read-only" });
    log.rows = Array.isArray(log.rows) ? log.rows : [];
    if (log.rows.length >= MAX_LOG_ROWS) return res(409, { error: "Log is full" });
    log.rows.push({ when, note });
    const nextPayload = JSON.stringify(current);
    if (nextPayload.length > MAX_PAYLOAD + 2000) return res(409, { error: "Log is full" });
    await ddb.send(new UpdateItemCommand({
      TableName: table,
      Key: marshall({ id: slug }),
      UpdateExpression: "SET payload = :p, updatedAt = :t",
      ExpressionAttributeValues: marshall({ ":p": nextPayload, ":t": now }),
    }));
    return res(200, { ok: true });
  }

  return res(400, { error: "Unknown action" });
};
