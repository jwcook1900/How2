import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Receives a sitter's feedback/suggestion left on a *published* guide and emails
 * it to the guide's creator when the guide is saved to an account (looked up by
 * slug in the SavedGuide table), otherwise to the team inbox.
 *
 * A standalone Lambda Function URL (not a GraphQL resolver) so it can read the
 * SavedGuide table without creating a data <-> function circular dependency —
 * same pattern as the stats function. Set the API key as an Amplify secret:
 *   RESEND_API_KEY
 * Configure as branch environment variables:
 *   EMAIL_FROM   the verified sender (falls back to SES_FROM)
 *   FEEDBACK_TO  fallback inbox; defaults to hello@gotitguides.com
 * (SAVEDGUIDE_TABLE + APP_BASE_URL are wired in backend.ts.)
 */
export const guideFeedbackFn = defineFunction({
  name: "guide-feedback",
  entry: "./handler.ts",
  resourceGroupName: "data", // reads the SavedGuide table; keeps deps one-way
  timeoutSeconds: 20,
  environment: {
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    SES_FROM: process.env.SES_FROM || "",
    FEEDBACK_TO: process.env.FEEDBACK_TO || "hello@gotitguides.com",
    APP_BASE_URL: process.env.APP_BASE_URL || "",
    SAVEDGUIDE_TABLE: "", // set from the SavedGuide table name in backend.ts
  },
});
