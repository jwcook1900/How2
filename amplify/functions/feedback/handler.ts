import type { Schema } from "../../data/resource";
import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({});

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wrap a base64 string to 76-char lines (RFC 2045) for the MIME body.
function wrap76(b64: string): string {
  return (b64.match(/.{1,76}/g) || []).join("\r\n");
}

/**
 * Emails a single piece of in-app feedback to the team. Reply-to is the
 * submitter's address when valid. If a screenshot was attached, the email is
 * sent as raw MIME with the image as an attachment.
 */
export const handler: Schema["sendFeedback"]["functionHandler"] = async (event) => {
  const message = (event.arguments.message || "").trim().slice(0, 5000);
  const email = (event.arguments.email || "").trim().slice(0, 200);
  const context = (event.arguments.context || "").trim().slice(0, 500);
  const image = event.arguments.image || "";
  const imageType = (event.arguments.imageType || "").toLowerCase();

  if (!message) throw new Error("Empty feedback");

  const from = process.env.SES_FROM;
  const to = process.env.FEEDBACK_TO || "hello@gotitguides.com";
  if (!from) throw new Error("Email is not configured");

  const replyOk = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
  const hasImage =
    !!image && /^(image\/jpeg|image\/png|image\/webp)$/.test(imageType) && image.length < 12_000_000;

  const text =
    "New GotIt Guides feedback\n\n" + message + "\n\n—\n" +
    "From: " + (replyOk ? email : "(not provided)") + "\n" +
    "Context: " + (context || "(none)") +
    (hasImage ? "\n(Screenshot attached)" : "");

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<h2 style="font-size:18px">New GotIt Guides feedback</h2>' +
    '<p style="white-space:pre-wrap;background:#F7F7F7;padding:14px 16px;border-radius:8px;margin:0 0 16px">' +
    esc(message) + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>From:</strong> ' + (replyOk ? esc(email) : "(not provided)") + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>Context:</strong> ' + esc(context || "(none)") + "</p>" +
    (hasImage ? '<p style="margin:8px 0 0;color:#555">📎 Screenshot attached.</p>' : "") +
    "</div>";

  const subject = "GotIt Guides feedback";

  if (!hasImage) {
    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyOk ? [email] : undefined,
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
      },
    }));
    return { ok: true };
  }

  // Raw MIME: multipart/mixed [ multipart/alternative(text, html), image attachment ].
  const ext = imageType === "image/png" ? "png" : imageType === "image/webp" ? "webp" : "jpg";
  const mixed = "mixed_" + Date.now();
  const alt = "alt_" + Date.now();
  const raw =
    "From: " + from + "\r\n" +
    "To: " + to + "\r\n" +
    (replyOk ? "Reply-To: " + email + "\r\n" : "") +
    "Subject: " + subject + "\r\n" +
    "MIME-Version: 1.0\r\n" +
    'Content-Type: multipart/mixed; boundary="' + mixed + '"\r\n\r\n' +
    "--" + mixed + "\r\n" +
    'Content-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n' +
    "--" + alt + "\r\n" +
    "Content-Type: text/plain; charset=UTF-8\r\n\r\n" + text + "\r\n\r\n" +
    "--" + alt + "\r\n" +
    "Content-Type: text/html; charset=UTF-8\r\n\r\n" + html + "\r\n\r\n" +
    "--" + alt + "--\r\n\r\n" +
    "--" + mixed + "\r\n" +
    "Content-Type: " + imageType + '; name="screenshot.' + ext + '"\r\n' +
    "Content-Transfer-Encoding: base64\r\n" +
    'Content-Disposition: attachment; filename="screenshot.' + ext + '"\r\n\r\n' +
    wrap76(image) + "\r\n\r\n" +
    "--" + mixed + "--\r\n";

  await ses.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw, "utf-8") } }));
  return { ok: true };
};
