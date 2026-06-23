import type { Schema } from "../../data/resource";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({});

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Emails a single piece of in-app feedback to the team. The reply-to is set to
 * the submitter's address when they provided a valid one, so replies go to them.
 */
export const handler: Schema["sendFeedback"]["functionHandler"] = async (event) => {
  const message = (event.arguments.message || "").trim().slice(0, 5000);
  const email = (event.arguments.email || "").trim().slice(0, 200);
  const context = (event.arguments.context || "").trim().slice(0, 500);

  if (!message) throw new Error("Empty feedback");

  const from = process.env.SES_FROM;
  const to = process.env.FEEDBACK_TO || "hello@gotitguides.com";
  if (!from) throw new Error("Email is not configured");

  // Only use the address as reply-to if it's valid and injection-safe.
  const replyOk = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);

  const text =
    "New GotIt Guides feedback\n\n" +
    message + "\n\n" +
    "—\n" +
    "From: " + (replyOk ? email : "(not provided)") + "\n" +
    "Context: " + (context || "(none)");

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<h2 style="font-size:18px">New GotIt Guides feedback</h2>' +
    '<p style="white-space:pre-wrap;background:#F7F7F7;padding:14px 16px;border-radius:8px;margin:0 0 16px">' +
    esc(message) + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>From:</strong> ' + (replyOk ? esc(email) : "(not provided)") + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>Context:</strong> ' + esc(context || "(none)") + "</p>" +
    "</div>";

  await ses.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyOk ? [email] : undefined,
      Message: {
        Subject: { Data: "GotIt Guides feedback", Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          Html: { Data: html, Charset: "UTF-8" },
        },
      },
    })
  );

  return { ok: true };
};
