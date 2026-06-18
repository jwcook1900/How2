import { defineBackend } from "@aws-amplify/backend";
import { data } from "./data/resource";

/**
 * How2 backend (Phase 1): a single Data resource for storing guides.
 * Auth and image storage (S3) come in later phases.
 */
defineBackend({
  data,
});
