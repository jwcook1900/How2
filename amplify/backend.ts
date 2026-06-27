import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function as LambdaFunction, FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";
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
  data,
  aiFn,
  emailFn,
  feedbackFn,
  statsFn,
  videoFn,
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
