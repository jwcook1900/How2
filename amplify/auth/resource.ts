import { defineAuth, secret } from "@aws-amplify/backend";

/**
 * Optional accounts for the "My Guides" dashboard.
 *
 * Guide *creation* never requires an account — this is only used when someone
 * chooses to save a guide to a dashboard (or create an account at share time).
 *
 * Sign-in: email (a one-time code, passwordless) plus "Continue with Google",
 * both presented through Cognito's hosted Managed Login.
 *
 * Before this deploys, set these as secrets in the Amplify console
 * (App settings → Secrets), created from a Google Cloud OAuth 2.0 client:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * After it deploys, in the Cognito console: create a hosted-UI domain, turn on
 * the email one-time-code sign-in option (Managed Login), and point Cognito's
 * email sending at SES so codes deliver reliably.
 */
/**
 * This branch's own Amplify Hosting origin, when building in Amplify. The
 * hosting subdomain is the branch name with everything outside [a-z0-9-]
 * replaced by a dash, so "claude/my-branch" serves at "claude-my-branch".
 * Null when building outside Amplify (a local sandbox), where localhost covers it.
 */
const appId = process.env.AWS_APP_ID || "";
const branch = process.env.AWS_BRANCH || "";
const branchOrigin =
  appId && branch
    ? "https://" + branch.replace(/[^a-zA-Z0-9-]/g, "-") + "." + appId + ".amplifyapp.com"
    : null;

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["email", "profile"],
        attributeMapping: { email: "email" },
      },
      // Where Cognito returns the user after sign-in / sign-out. The dashboard
      // page reads the auth code, finishes login, then completes any pending
      // "save this guide" action.
      // A branch's own amplifyapp.com origin is included alongside the live
      // domain. Without it a preview branch gets "redirect_mismatch": its pool
      // only trusted production's URLs, so sign-in could not be rehearsed
      // anywhere but live, which is the last place you want to find out.
      callbackUrls: [
        "https://www.gotitguides.com/dashboard.html",
        "https://gotitguides.com/dashboard.html",
        "http://localhost:8093/dashboard.html",
        ...(branchOrigin ? [branchOrigin + "/dashboard.html"] : []),
      ],
      logoutUrls: [
        "https://www.gotitguides.com/",
        "https://gotitguides.com/",
        "http://localhost:8093/",
        ...(branchOrigin ? [branchOrigin + "/"] : []),
      ],
    },
  },
});
