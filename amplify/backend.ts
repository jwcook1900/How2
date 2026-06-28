import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function as LambdaFunction, FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { aiFn } from "./functions/ai/resource";
import { emailFn } from "./functions/email/resource";
import { feedbackFn } from "./functions/feedback/resource";
import { statsFn } from "./functions/stats/resource";
import { videoFn } from "./functions/video/resource";

/**
 * GotIt Guides backend: guide storage (Data), a server-side AI helper (aiFn), an
 * SES-backed email sender (emailFn) for the "email me my links" option, a
 * feedback emailer (feedbackFn), and a first-party analytics reader (statsFn).
 * Auth and image storage (S3) come in later phases.
 */
const backend = defineBackend({
  auth,
  data,
  aiFn,
  emailFn,
  feedbackFn,
  statsFn,
  videoFn,
});

// Note: we do NOT add a Cognito user pool domain here. Amplify already
// provisions one automatically for the hosted Managed Login + Google sign-in
// (a user pool can only have one domain, so adding a second fails the deploy).
// After deploy, read the generated domain from the Cognito console and set the
// Google OAuth client's authorised redirect URI to <domain>/oauth2/idpresponse.

// Let the email + feedback functions send through SES.
for (const fn of [backend.emailFn, backend.feedbackFn]) {
  fn.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    })
  );
}

// Stats reader: read the Event table and expose a passphrase-protected URL.
// It's a standalone Lambda URL (not a GraphQL resolver) so the data <-> function
// dependency stays one-directional (no CloudFormation circular dependency).
const eventTable = backend.data.resources.tables["Event"];
const statsLambda = backend.statsFn.resources.lambda as LambdaFunction;
statsLambda.addEnvironment("EVENT_TABLE", eventTable.tableName);
eventTable.grantReadData(statsLambda);
const statsUrl = statsLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // protected by the passphrase in the handler
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ["content-type"],
  },
});
backend.addOutput({ custom: { statsFunctionUrl: statsUrl.url } });
