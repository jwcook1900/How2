import type { Schema } from "../../data/resource";
import { sendEmail } from "../shared/sendEmail";

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  const from = process.env.EMAIL_FROM || process.env.SES_FROM;
  const to = process.env.FEEDBACK_TO || "hello@gotitguides.com";
  if (!from) throw new Error("Email is not configured");

  const replyOk = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
  const hasImage =
    !!image && /^(image\/jpeg|image\/png|image\/webp)$/.test(imageType) && image.length < 12_000_000;

  // Demo requests from the vets page ride this same pipe; give them their own
  // subject so they never drown in general feedback.
  const isDemo = /\bdemo\b/i.test(context);

  const text =
    (isDemo ? "New demo request — Digital Recovery Guides" : "New GotIt Guides feedback") + "\n\n" + message + "\n\n—\n" +
    "From: " + (replyOk ? email : "(not provided)") + "\n" +
    "Context: " + (context || "(none)") +
    (hasImage ? "\n(Screenshot attached)" : "");

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<h2 style="font-size:18px">' + (isDemo ? "New demo request — Digital Recovery Guides" : "New GotIt Guides feedback") + "</h2>" +
    '<p style="white-space:pre-wrap;background:#F7F7F7;padding:14px 16px;border-radius:8px;margin:0 0 16px">' +
    esc(message) + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>From:</strong> ' + (replyOk ? esc(email) : "(not provided)") + "</p>" +
    '<p style="margin:4px 0;color:#555"><strong>Context:</strong> ' + esc(context || "(none)") + "</p>" +
    (hasImage ? '<p style="margin:8px 0 0;color:#555">📎 Screenshot attached.</p>' : "") +
    "</div>";

  const subject = isDemo ? "Demo request — Digital Recovery Guides" : "GotIt Guides feedback";

  // Resend takes attachments natively (base64 content), so the screenshot is
  // just another field — no hand-rolled MIME needed.
  const ext = imageType === "image/png" ? "png" : imageType === "image/webp" ? "webp" : "jpg";
  await sendEmail({
    from,
    to,
    subject,
    text,
    html,
    replyTo: replyOk ? email : undefined,
    attachments: hasImage
      ? [{ filename: "screenshot." + ext, content: image, contentType: imageType }]
      : undefined,
  });
  return { ok: true };
};
