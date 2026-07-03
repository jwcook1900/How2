import type { Schema } from "../../data/resource";
import { sendEmail } from "../shared/sendEmail";

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sends a one-time welcome email when someone creates an account. The recipient
 * is taken from the caller's own verified identity (the Cognito email claim) —
 * never a client-supplied address — so this can't be used to email anyone else.
 * The app only calls it once per account (guarded by the user's profile record).
 */
export const handler: Schema["sendWelcome"]["functionHandler"] = async (event) => {
  const claims: any = (event.identity && (event.identity as any).claims) || {};
  const email = String(claims.email || "").trim();
  const name = String(event.arguments.name || claims.name || claims.given_name || "").trim();
  const first = name ? name.split(/\s+/)[0].slice(0, 40) : "";

  const from = process.env.EMAIL_FROM || process.env.SES_FROM;
  if (!from) throw new Error("Email is not configured");
  // No valid recipient on the identity — skip quietly rather than error.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    return { ok: false };
  }

  const base = (process.env.APP_BASE_URL || "https://www.gotitguides.com").replace(/\/+$/, "");
  const dashUrl = base + "/dashboard.html";
  const createUrl = base + "/builder.html";

  const hi = first ? "Hi " + first : "Hi there";
  const text =
    hi + ",\n\n" +
    "Welcome to GotIt Guides — you now have a free dashboard to keep all your care guides in one place.\n\n" +
    "With an account you can:\n" +
    "• Save guides and find them any time\n" +
    "• Update a guide and everyone with the link sees the latest version\n" +
    "• Share by link or QR — for pets, kids, homes, sitters and guests\n\n" +
    "Your dashboard: " + dashUrl + "\n" +
    "Start a new guide: " + createUrl + "\n\n" +
    "Creating and sharing guides is always free.\n\n" +
    "— GotIt Guides";

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<h2 style="font-size:20px;margin:0 0 6px">Welcome to GotIt Guides 👋</h2>' +
    '<p style="color:#555;margin:0 0 16px">' + esc(hi) + ", you now have a free dashboard to keep all your care guides in one place.</p>" +
    '<p style="margin:0 0 6px;font-weight:600">With an account you can:</p>' +
    '<ul style="color:#333;line-height:1.6;margin:0 0 18px;padding-left:20px">' +
    "<li>Save guides and find them any time</li>" +
    "<li>Update a guide once — everyone with the link sees the latest</li>" +
    "<li>Share by link or QR: pets, kids, homes, sitters and guests</li>" +
    "</ul>" +
    '<p style="margin:0 0 22px">' +
    '<a href="' + esc(dashUrl) + '" style="display:inline-block;background:#FF6B35;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Open my dashboard →</a>' +
    "</p>" +
    '<p style="color:#777;font-size:14px;margin:0 0 4px">Or <a href="' + esc(createUrl) + '" style="color:#FF6B35">start a new guide</a>.</p>' +
    '<p style="color:#999;font-size:13px;margin-top:24px">Creating and sharing guides is always free. — GotIt Guides · guides people get</p>' +
    "</div>";

  await sendEmail({
    from,
    to: email,
    subject: "Welcome to GotIt Guides 👋",
    text,
    html,
  });
  return { ok: true };
};
