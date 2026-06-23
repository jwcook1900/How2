import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { data } from "./data/resource";
import { aiFn } from "./functions/ai/resource";
import { emailFn } from "./functions/email/resource";
import { feedbackFn } from "./functions/feedback/resource";

/**
 * GotIt Guides backend: guide storage (Data), a server-side AI helper (aiFn), an
 * SES-backed email sender (emailFn) for the "email me my links" option, and a
 * feedback emailer (feedbackFn). Auth and image storage (S3) come in later phases.
 */
const backend = defineBackend({
  data,
  aiFn,
  emailFn,
  feedbackFn,
});

// Let the email + feedback functions send through SES.
for (const fn of [backend.emailFn, backend.feedbackFn]) {
  fn.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: ["ses:SendEmail"],
      resources: ["*"],
    })
  );
}
