import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Cognito's custom email sender: every email the user pool would have sent goes
 * through this function instead, and out via Resend.
 *
 * Why this exists: Cognito can only send through its own built-in address or
 * SES, and AWS declined SES production access for this account in ap-southeast-2
 * (support case 178227182200311, 1 July 2026). The built-in sender is
 * no-reply@verificationemail.com, a shared AWS address whose reputation we don't
 * control — a sign-in code from it landed straight in Gmail's spam folder during
 * testing, which for a veterinary clinic reads as "this product is broken", or
 * worse, as phishing. Resend already sends every other GotIt email from a
 * verified gotitguides.com, so the sign-in code now travels the same road as the
 * guide links a clinic already trusts.
 *
 * Cognito hands us the one-time code encrypted with the AWS Encryption SDK under
 * a KMS key (wired up in backend.ts); we decrypt it here and never log it.
 *
 * Secrets/vars (same ones the other email functions use):
 *   RESEND_API_KEY   Amplify secret; the sending domain must be verified there
 *   EMAIL_FROM       e.g. "GotIt Guides <hello@gotitguides.com>"
 *   KMS_KEY_ARN      set from backend.ts once the key exists
 */
export const authEmailFn = defineFunction({
  name: "auth-email",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    SES_FROM: process.env.SES_FROM || "",
  },
});
