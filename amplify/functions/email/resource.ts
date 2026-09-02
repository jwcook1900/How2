import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Sends a creator their guide links (and, if set, the password) by email at the
 * point of publish — a no-account safety net so a lost edit link doesn't orphan
 * the guide. Sends via Resend (transactional email provider).
 *
 * Set the API key as an Amplify secret (App settings → Secrets):
 *   RESEND_API_KEY   from resend.com; the sending domain must be verified there.
 *
 * Configure these as branch environment variables in the Amplify console:
 *   EMAIL_FROM     the verified sender, e.g. "GotIt Guides <hello@gotitguides.com>"
 *                  (falls back to the legacy SES_FROM var if EMAIL_FROM is unset)
 *   APP_BASE_URL   (optional) your custom domain origin, e.g. "https://gotitguides.com"
 */
export const emailFn = defineFunction({
  name: "send-links",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    SES_FROM: process.env.SES_FROM || "",
    APP_BASE_URL: process.env.APP_BASE_URL || "",
  },
});
