import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { data } from "./data/resource";
import { aiFn } from "./functions/ai/resource";
import { emailFn } from "./functions/email/resource";

/**
 * GotIt Guides backend: guide storage (Data), a server-side AI helper (aiFn), and an
 * SES-backed email sender (emailFn) for the "email me my links" option.
 * Auth and image storage (S3) come in later phases.
 */
const backend = defineBackend({
  data,
  aiFn,
  emailFn,
});

// Let the email function send through SES.
backend.emailFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["ses:SendEmail"],
    resources: ["*"],
  })
);
