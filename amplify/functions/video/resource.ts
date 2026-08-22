import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Issues a one-time Cloudflare Stream "direct creator upload" URL so a guide
 * creator's phone can upload a video straight to Cloudflare without the API
 * token ever reaching the browser. Cloudflare then transcodes the clip (e.g.
 * iPhone HEVC/.mov → H.264) and serves an embeddable player, so uploaded
 * videos play on any device.
 *
 * The API token is stored as an Amplify secret (App settings → Secrets), so it
 * lives encrypted rather than as a plaintext env var:
 *   CF_STREAM_TOKEN  a Cloudflare API token scoped to Stream:Edit
 * The (non-secret) account id stays a branch environment variable:
 *   CF_ACCOUNT_ID    your Cloudflare account id
 *
 * Until both are set, the function returns a friendly "not configured" error
 * and the builder keeps the paste-a-link option working.
 */
export const videoFn = defineFunction({
  name: "video-upload",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  environment: {
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || "",
    CF_STREAM_TOKEN: secret("CF_STREAM_TOKEN"),
  },
});
