import { defineFunction } from "@aws-amplify/backend";

/**
 * Emails in-app feedback to the team via Amazon SES. Feedback is also stored in
 * the Feedback table (durable), so this is the "notify us now" path.
 *
 * Configure as branch environment variables in the Amplify console:
 *   SES_FROM       a verified SES sender, e.g. "GotIt Guides <hello@gotitguides.com>"
 *   FEEDBACK_TO    (optional) where feedback is sent; defaults to hello@gotitguides.com
 *
 * Note: SES starts in sandbox mode (can only email verified addresses); verify
 * the gotitguides.com domain and request production access for full delivery.
 */
export const feedbackFn = defineFunction({
  name: "send-feedback",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    SES_FROM: process.env.SES_FROM || "",
    FEEDBACK_TO: process.env.FEEDBACK_TO || "hello@gotitguides.com",
  },
});
