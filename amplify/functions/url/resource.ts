import { defineFunction } from "@aws-amplify/backend";

/**
 * Reads a public web page or Google Doc the creator pastes a link to, and
 * returns its visible text so the AI import can turn it into a guide. Fetches
 * are guarded against SSRF (only public http/https hosts; private, loopback and
 * link-local addresses are refused). No secrets or data-table access needed.
 */
export const urlFn = defineFunction({
  name: "read-url",
  entry: "./handler.ts",
  timeoutSeconds: 20,
});
