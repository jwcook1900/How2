import { defineFunction } from "@aws-amplify/backend";

/**
 * Reads lightweight first-party analytics (publish/view/share counts) from the
 * Event table and returns aggregates. Protected by a passphrase so the numbers
 * aren't public.
 *
 * Configure as a branch environment variable in the Amplify console:
 *   STATS_KEY   a passphrase you choose; you'll enter the same one on /stats.html
 * (EVENT_TABLE is wired automatically in backend.ts.)
 */
export const statsFn = defineFunction({
  name: "stats",
  entry: "./handler.ts",
  // Lives in the data stack because it reads the Event table — keeps the
  // data <-> function stack dependency one-directional (no circular dependency).
  resourceGroupName: "data",
  timeoutSeconds: 28,
  environment: {
    STATS_KEY: process.env.STATS_KEY || "",
    EVENT_TABLE: "", // set from the Event table name in backend.ts
  },
});
