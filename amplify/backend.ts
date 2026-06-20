import { defineBackend } from "@aws-amplify/backend";
import { data } from "./data/resource";
import { aiFn } from "./functions/ai/resource";

/**
 * How2 backend: guide storage (Data) + a server-side AI helper (aiFn).
 * Auth and image storage (S3) come in later phases.
 */
defineBackend({
  data,
  aiFn,
});
