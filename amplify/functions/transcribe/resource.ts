import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Speech-to-text for the "Talk it out" flow. Receives a short audio recording
 * from the browser and returns its transcript (via OpenAI Whisper), which the
 * AI import then turns into a guide. Exposed as a standalone Lambda Function URL
 * (not a GraphQL resolver) so it can accept the larger audio payloads without
 * AppSync's tighter request limit. The API key is an Amplify secret.
 *
 * Before this deploys, set the secret in the Amplify console:
 *   Hosting → Secrets → add OPENAI_API_KEY for the branch.
 */
export const transcribeFn = defineFunction({
  name: "transcribe",
  entry: "./handler.ts",
  timeoutSeconds: 60, // Whisper on a ~2-min clip is a few seconds; leave headroom
  memoryMB: 512,
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
  },
});
