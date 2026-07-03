import { DynamoDBClient, ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { sendEmail } from "../shared/sendEmail";

const ddb = new DynamoDBClient({});
const HEADERS = { "content-type": "application/json" };

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST { slug, title, message, email? } → emails the feedback to the guide's
 * owner (if the guide is saved to an account) or the fallback inbox.
 */
export const handler = async (event: any) => {
  try {
    if (event?.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 204, headers: HEADERS, body: "" };
    }
    let raw = event && event.body;
    if (event && event.isBase64Encoded && raw) raw = Buffer.from(raw, "base64").toString("utf8");
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch (e) { body = {}; }

    const slug = String(body.slug || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 4000);
    const title = String(body.title || "a guide").slice(0, 200);
    const fromEmail = String(body.email || "").trim().slice(0, 200);
    if (!message) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "empty" }) };

    const from = process.env.EMAIL_FROM || process.env.SES_FROM;
    const fallback = process.env.FEEDBACK_TO || "hello@gotitguides.com";
    if (!from) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: "not configured" }) };

    // Look up the guide's owner (server-side; never exposed to the client): the
    // email to notify, and the owner identity to attach a dashboard record to.
    let to = fallback;
    let toOwner = false;
    let ownerId = "";
    const table = process.env.SAVEDGUIDE_TABLE;
    if (table && /^[a-z0-9-]{1,80}$/.test(slug)) {
      try {
        let startKey: Record<string, any> | undefined = undefined;
        do {
          const res: any = await ddb.send(new ScanCommand({
            TableName: table,
            FilterExpression: "slug = :s",
            ExpressionAttributeValues: { ":s": { S: slug } },
            ProjectionExpression: "ownerEmail, #o",
            ExpressionAttributeNames: { "#o": "owner" },
            ExclusiveStartKey: startKey,
          }));
          for (const item of res.Items || []) {
            const oe = item.ownerEmail && item.ownerEmail.S;
            if (oe && EMAIL_RE.test(oe)) {
              to = oe; toOwner = true;
              ownerId = (item.owner && item.owner.S) || "";
              break;
            }
          }
          startKey = toOwner ? undefined : res.LastEvaluatedKey;
        } while (startKey);
      } catch (e) { /* fall back to the team inbox */ }
    }

    const replyOk = !!fromEmail && EMAIL_RE.test(fromEmail) && !/[\r\n]/.test(fromEmail);

    // Store it on the creator's dashboard (owner-scoped) when we know the owner.
    const fbTable = process.env.GUIDEFEEDBACK_TABLE;
    if (toOwner && ownerId && fbTable) {
      const now = new Date().toISOString();
      const item: Record<string, any> = {
        id: { S: randomUUID() },
        __typename: { S: "GuideFeedback" },
        owner: { S: ownerId },
        slug: { S: slug },
        title: { S: title },
        message: { S: message },
        createdAt: { S: now },
        updatedAt: { S: now },
      };
      if (replyOk) item.fromEmail = { S: fromEmail };
      try { await ddb.send(new PutItemCommand({ TableName: fbTable, Item: item })); } catch (e) { /* email still sent */ }
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
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
