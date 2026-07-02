import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Emails in-app feedback to the team via Resend. Feedback is also stored in the
 * Feedback table (durable), so this is the "notify us now" path.
 *
 * Set the API key as an Amplify secret (App settings → Secrets):
 *   RESEND_API_KEY   from resend.com; the sending domain must be verified there.
 *
 * Configure as branch environment variables in the Amplify console:
 *   EMAIL_FROM     the verified sender, e.g. "GotIt Guides <hello@gotitguides.com>"
 *                  (falls back to the legacy SES_FROM var if EMAIL_FROM is unset)
 *   FEEDBACK_TO    (optional) where feedback is sent; defaults to hello@gotitguides.com
 */
export const feedbackFn = defineFunction({
  name: "send-feedback",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    SES_FROM: process.env.SES_FROM || "",
    FEEDBACK_TO: process.env.FEEDBACK_TO || "hello@gotitguides.com",
  },
});
