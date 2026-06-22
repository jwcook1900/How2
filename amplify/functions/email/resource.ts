import { defineFunction } from "@aws-amplify/backend";

/**
 * Sends a creator their guide links (and, if set, the password) by email at the
 * point of publish — a no-account safety net so a lost edit link doesn't orphan
 * the guide. Uses Amazon SES; the function role is granted ses:SendEmail in
 * backend.ts.
 *
 * Configure these as branch environment variables in the Amplify console:
 *   SES_FROM       a verified SES sender, e.g. "How2 <links@yourdomain.com>"
 *   APP_BASE_URL   (optional) your custom domain origin, e.g. "https://how2.app"
 *
 * Note: SES starts in sandbox mode (can only email verified addresses). Request
 * SES production access before real users can receive these.
 */
export const emailFn = defineFunction({
  name: "send-links",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    SES_FROM: process.env.SES_FROM || "",
    APP_BASE_URL: process.env.APP_BASE_URL || "",
  },
});
