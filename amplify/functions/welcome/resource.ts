import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Sends a one-time welcome email on first sign-in, via Resend. The app calls
 * this once per new account (guarded by the user's profile record). The
 * recipient is the caller's own verified email (from the Cognito identity),
 * so it can't be used to email arbitrary addresses.
 *
 * Uses the shared RESEND_API_KEY secret and EMAIL_FROM/SES_FROM branch vars.
 */
export const welcomeFn = defineFunction({
  name: "send-welcome",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    SES_FROM: process.env.SES_FROM || "",
    APP_BASE_URL: process.env.APP_BASE_URL || "",
  },
});
