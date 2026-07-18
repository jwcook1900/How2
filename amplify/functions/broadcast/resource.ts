import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Broadcast email tool: sends a product update to everyone we may lawfully
 * email — account holders (inferred consent under the AU Spam Act, with
 * identity + unsubscribe in every message) and waitlist signups (express
 * consent) — minus anyone who has unsubscribed. Composed from the private
 * /stats page, protected by the same STATS_KEY passphrase.
 *
 * The same Lambda URL also serves GET /unsub, the one-click unsubscribe
 * link embedded in every email (HMAC-signed so addresses can't be
 * unsubscribed by guessing).
 *
 * Recipients are read live at send time (Cognito ListUsers + Feedback rows
 * with context "waitlist"); unsubscribes are stored as Feedback rows with
 * context "unsub". Never emails sitters/recipients — only creators who
 * signed up or joined the waitlist.
 */
export const broadcastFn = defineFunction({
  name: "broadcast",
  entry: "./handler.ts",
  // Reads the Feedback table, so it lives in the data stack (one-directional
  // dependency, same reasoning as the stats function).
  resourceGroupName: "data",
  timeoutSeconds: 120,
  environment: {
    STATS_KEY: process.env.STATS_KEY || "",
    RESEND_API_KEY: secret("RESEND_API_KEY"),
    EMAIL_FROM: process.env.EMAIL_FROM || "",
    FEEDBACK_TABLE: "", // set from the Feedback table name in backend.ts
    USER_POOL_ID: "",   // set in backend.ts
  },
});
