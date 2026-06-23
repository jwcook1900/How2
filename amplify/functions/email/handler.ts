import type { Schema } from "../../data/resource";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({});

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Emails the creator their view link, edit link and (per the user's choice)
 * their password. URLs are built server-side from a validated origin so this
 * endpoint can't be used to send arbitrary external links from our domain.
 */
export const handler: Schema["sendLinks"]["functionHandler"] = async (event) => {
  const email = (event.arguments.email || "").trim();
  const slug = (event.arguments.slug || "").trim();
  const token = (event.arguments.editToken || "").trim();
  const origin = (event.arguments.origin || "").trim().replace(/\/+$/, "");
  const title = (event.arguments.title || "your guide").slice(0, 120);
  const emoji = (event.arguments.emoji || "📘").slice(0, 8);
  const password = (event.arguments.password || "").slice(0, 200);

  const from = process.env.SES_FROM;
  if (!from) throw new Error("Email is not configured");

  // Validate inputs (also guards against header injection via the address).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    throw new Error("Please enter a valid email address");
  }
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !token || token.length > 200) {
    throw new Error("Invalid guide reference");
  }
  const allowed =
    /^https:\/\/[a-z0-9.-]+\.amplifyapp\.com$/.test(origin) ||
    (!!process.env.APP_BASE_URL && origin === process.env.APP_BASE_URL.replace(/\/+$/, ""));
  if (!allowed) throw new Error("Invalid origin");

  const viewUrl = origin + "/guide.html?g=" + encodeURIComponent(slug);
  const editUrl =
    origin + "/builder.html?g=" + encodeURIComponent(slug) + "&t=" + encodeURIComponent(token);

  const passText = password
    ? "\n\nPassword (needed to view this guide): " + password +
      "\n⚠️ Anyone with this email can open your guide — it contains both the link and the password. " +
      "Keep it private, and delete this email if you forward the link to someone else."
    : "";

  const text =
    emoji + " " + title + "\n\n" +
    "Here are your GotIt Guides guide links — keep this email safe.\n\n" +
    "View / share link:\n" + viewUrl + "\n\n" +
    "Private edit link (lets you change the guide — don't share it):\n" + editUrl +
    passText + "\n\n— GotIt Guides";

  const passHtml = password
    ? '<p style="margin:18px 0 4px;font-weight:600">Password (needed to view this guide)</p>' +
      '<p style="font-size:18px;font-family:monospace;background:#FFF3EC;padding:10px 14px;border-radius:8px;display:inline-block;margin:0">' +
      esc(password) + "</p>" +
      '<p style="color:#B23A12;font-size:13px;line-height:1.5;margin:12px 0 0">⚠️ Anyone with this email can open your guide — it has both the link and the password. ' +
      "Keep it private, and delete it if you forward the link to someone else.</p>"
    : "";

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<h2 style="font-size:20px">' + esc(emoji) + " " + esc(title) + "</h2>" +
    '<p style="color:#555">Here are your GotIt Guides guide links — keep this email safe.</p>' +
    '<p style="margin:18px 0 4px;font-weight:600">View / share link</p>' +
    '<p style="margin:0"><a href="' + esc(viewUrl) + '">' + esc(viewUrl) + "</a></p>" +
    '<p style="margin:18px 0 4px;font-weight:600">Private edit link <span style="color:#888;font-weight:400">(don\'t share)</span></p>' +
    '<p style="margin:0"><a href="' + esc(editUrl) + '">' + esc(editUrl) + "</a></p>" +
    passHtml +
    '<p style="color:#999;font-size:13px;margin-top:28px">— GotIt Guides · guides people get</p>' +
    "</div>";

  await ses.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Your GotIt Guides guide links — " + title, Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          Html: { Data: html, Charset: "UTF-8" },
        },
      },
    })
  );

  return { ok: true };
};
