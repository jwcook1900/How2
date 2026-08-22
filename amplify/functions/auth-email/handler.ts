import { buildClient, CommitmentPolicy, KmsKeyringNode } from "@aws-crypto/client-node";
import { sendEmail } from "../shared/sendEmail";

/* Cognito encrypts the one-time code with the AWS Encryption SDK (not a bare
   KMS Decrypt), so decrypting it needs the same client on this side. */
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

interface CustomEmailSenderEvent {
  triggerSource: string;
  request: {
    type?: string;
    code?: string | null;
    userAttributes?: Record<string, string>;
    clientMetadata?: Record<string, string>;
  };
}

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let keyring: KmsKeyringNode | null = null;
async function plainCode(encoded: string): Promise<string> {
  const keyArn = process.env.KMS_KEY_ARN;
  if (!keyArn) throw new Error("KMS key is not configured");
  if (!keyring) keyring = new KmsKeyringNode({ keyIds: [keyArn] });
  const { plaintext } = await decrypt(keyring, Buffer.from(encoded, "base64"));
  return plaintext.toString("utf8");
}

/* ---- copy per reason ----
   Each email says who it's from, why it arrived and what to do with it. A bare
   "your code is 123456" from an unfamiliar address is indistinguishable from
   phishing, and a clinic that has just been told their patients' data is
   handled carefully is exactly the audience that will notice. */
export interface Wording {
  subject: string;
  lead: string;
  label: string;
  footnote: string;
}

export function wordingFor(triggerSource: string, isTempPassword: boolean): Wording {
  const ignore =
    "If you didn't ask for this, you can ignore this email. Nobody can get in without the code.";
  switch (triggerSource) {
    case "CustomEmailSender_Authentication":
      return {
        subject: "Your GotIt Guides sign-in code",
        lead: "Here's your code to sign in to GotIt Guides.",
        label: "Sign-in code",
        footnote: ignore,
      };
    case "CustomEmailSender_SignUp":
    case "CustomEmailSender_ResendCode":
      return {
        subject: "Confirm your GotIt Guides account",
        lead: "Welcome to GotIt Guides. Enter this code to confirm your email address and finish setting up your account.",
        label: "Confirmation code",
        footnote: ignore,
      };
    case "CustomEmailSender_ForgotPassword":
      return {
        subject: "Reset your GotIt Guides password",
        lead: "Here's your code to reset the password on your GotIt Guides account.",
        label: "Reset code",
        footnote:
          "If you didn't ask to reset your password, you can ignore this email. Your password stays as it is.",
      };
    case "CustomEmailSender_UpdateUserAttribute":
    case "CustomEmailSender_VerifyUserAttribute":
      return {
        subject: "Confirm your new GotIt Guides email address",
        lead: "Enter this code to confirm the new email address on your GotIt Guides account.",
        label: "Confirmation code",
        footnote: ignore,
      };
    case "CustomEmailSender_AdminCreateUser":
      return {
        subject: "Your GotIt Guides account is ready",
        lead: "An account has been set up for you on GotIt Guides. Use this temporary password to sign in, and you'll be asked to set your own.",
        label: "Temporary password",
        footnote: "If you weren't expecting this, you can ignore this email.",
      };
    default:
      // An unrecognised reason still gets an email. Silence here means a person
      // sits waiting for a code that never comes, which is the worst outcome
      // available, so the generic wording is deliberately the fallback.
      return {
        subject: isTempPassword
          ? "Your GotIt Guides account is ready"
          : "Your GotIt Guides code",
        lead: "Here's your code for GotIt Guides.",
        label: isTempPassword ? "Temporary password" : "Code",
        footnote: ignore,
      };
  }
}

export function render(w: Wording, code: string): { text: string; html: string } {
  const text =
    w.lead + "\n\n" +
    w.label + ": " + code + "\n\n" +
    "This code expires shortly, so use it soon.\n\n" +
    w.footnote + "\n\n" +
    "GotIt Guides\nhttps://www.gotitguides.com";

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">' +
    '<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 22px">' + esc(w.lead) + "</p>" +
    '<p style="margin:0 0 6px;font-weight:600;font-size:14px">' + esc(w.label) + "</p>" +
    '<p style="font-size:30px;letter-spacing:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'background:#FAFAF8;border:1px solid #EFEFEA;border-left:4px solid #ED7446;' +
    'padding:16px 20px;border-radius:10px;display:inline-block;margin:0;font-weight:700">' +
    esc(code) + "</p>" +
    '<p style="color:#666;font-size:14px;line-height:1.6;margin:22px 0 0">This code expires shortly, so use it soon.</p>' +
    '<p style="color:#666;font-size:14px;line-height:1.6;margin:10px 0 0">' + esc(w.footnote) + "</p>" +
    '<p style="color:#999;font-size:13px;margin-top:30px;border-top:1px solid #EFEFEA;padding-top:16px">' +
    'GotIt Guides · <a href="https://www.gotitguides.com" style="color:#999">gotitguides.com</a></p>' +
    "</div>";

  return { text, html };
}

/**
 * Sends every Cognito user-pool email through Resend.
 *
 * Throwing matters here: Cognito surfaces a failure to the person waiting on the
 * code, which is recoverable (they retry). Returning quietly on a send failure
 * would leave them staring at a code entry box for an email that is never
 * coming. The code itself is never logged.
 */
export const handler = async (event: CustomEmailSenderEvent): Promise<void> => {
  const to = (event.request.userAttributes?.email || "").trim();
  const encoded = event.request.code;

  if (!to || /[\r\n]/.test(to)) throw new Error("No usable email address on the user");
  if (!encoded) {
    // Cognito sends some notification events with no code at all (an account
    // takeover notice, for instance). There's nothing for us to deliver.
    console.log("auth-email: no code on", event.triggerSource, "- nothing to send");
    return;
  }

  const from = process.env.EMAIL_FROM || process.env.SES_FROM;
  if (!from) throw new Error("Email is not configured");

  const code = await plainCode(encoded);
  const isTempPassword = event.triggerSource === "CustomEmailSender_AdminCreateUser";
  const w = wordingFor(event.triggerSource, isTempPassword);
  const { text, html } = render(w, code);

  await sendEmail({ from, to, subject: w.subject, text, html });
  console.log("auth-email: sent for", event.triggerSource);
};
