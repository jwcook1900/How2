import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Server-side AI helper. Holds the Anthropic API key as an Amplify secret so it
 * never reaches the browser. Powers keyless AI Polish and (next) the notes import.
 *
 * Before this deploys, set the secret in the Amplify console:
 *   App settings → Secrets → add ANTHROPIC_API_KEY for the branch.
 */
export const aiFn = defineFunction({
  name: "ai-assist",
  entry: "./handler.ts",
  timeoutSeconds: 28, // stay under AppSync's 30s resolver limit
  environment: {
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
  },
});
