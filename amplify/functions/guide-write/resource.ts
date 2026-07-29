import { defineFunction } from "@aws-amplify/backend";

/**
 * The only path that can write a guide. The Guide model is public READ-only;
 * every create/update (and viewer log entry) comes through here so the edit
 * token can be verified server-side — it is stored as a SHA-256 hash in an
 * attribute the GraphQL schema never exposes, and it never travels back to a
 * browser. Also enforces a per-IP rate limit (RATE_TABLE) so the open
 * endpoints can't be flooded.
 * (GUIDE_TABLE / RATE_TABLE are wired in backend.ts.)
 */
export const guideWriteFn = defineFunction({
  name: "guide-write",
  entry: "./handler.ts",
  // Lives in the data stack because it writes the Guide table — keeps the
  // data <-> function stack dependency one-directional (no circular dependency).
  resourceGroupName: "data",
  timeoutSeconds: 20,
  memoryMB: 512,
  environment: {
    GUIDE_TABLE: "", // set from the Guide table name in backend.ts
    RATE_TABLE: "",  // set from the rate-limit table name in backend.ts
  },
});
