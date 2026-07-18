import { defineBackend } from "@aws-amplify/backend";
import { Function as LambdaFunction, FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { aiFn } from "./functions/ai/resource";
import { emailFn } from "./functions/email/resource";
import { feedbackFn } from "./functions/feedback/resource";
import { statsFn } from "./functions/stats/resource";
import { videoFn } from "./functions/video/resource";
import { welcomeFn } from "./functions/welcome/resource";
import { guideFeedbackFn } from "./functions/guide-feedback/resource";
import { urlFn } from "./functions/url/resource";
import { transcribeFn } from "./functions/transcribe/resource";
import { ogFn } from "./functions/og/resource";
import { broadcastFn } from "./functions/broadcast/resource";
import { CfnUserPoolDomain } from "aws-cdk-lib/aws-cognito";

/**
 * GotIt Guides backend: guide storage (Data), a server-side AI helper (aiFn), a
 * Resend-backed email sender (emailFn) for the "email me my links" option, a
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
  welcomeFn,
  guideFeedbackFn,
  urlFn,
  transcribeFn,
  ogFn,
  broadcastFn,
});

// Custom hosted-UI domain so the Google sign-in screen shows
// "auth.gotitguides.com" instead of the generated Cognito domain. It's added
// ALONGSIDE the Amplify-managed prefix domain — the app keeps signing people in
// on the prefix domain until we point it at this one client-side, so deploying
// this can't interrupt live sign-in. (If this pool won't accept a second domain,
// the stack simply rolls back with no effect on sign-in.) The ACM cert it
// references must be in us-east-1 — Cognito requires that region for custom
// domains, even though the pool is in ap-southeast-2.
const authCustomDomain = new CfnUserPoolDomain(
  backend.auth.resources.userPool.stack,
  "GotItAuthCustomDomain",
  {
    userPoolId: backend.auth.resources.userPool.userPoolId,
    domain: "auth.gotitguides.com",
    customDomainConfig: {
      certificateArn:
        "arn:aws:acm:us-east-1:485215543116:certificate/fd7963c2-72ba-44d7-87e4-b2b2815e0822",
    },
  }
);

// The email + feedback functions send via Resend's HTTPS API (key injected as
// the RESEND_API_KEY secret), so they need no AWS SES/IAM permissions.

// Stats reader: read the Event table and expose a passphrase-protected URL.
// It's a standalone Lambda URL (not a GraphQL resolver) so the data <-> function
// dependency stays one-directional (no CloudFormation circular dependency).
const eventTable = backend.data.resources.tables["Event"];
const statsLambda = backend.statsFn.resources.lambda as LambdaFunction;
statsLambda.addEnvironment("EVENT_TABLE", eventTable.tableName);
eventTable.grantReadData(statsLambda);
// Accounts ticker: count users (and this week's signups) from the pool.
statsLambda.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
backend.auth.resources.userPool.grant(statsLambda, "cognito-idp:ListUsers");
const statsUrl = statsLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // protected by the passphrase in the handler
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ["content-type"],
  },
});
// Guide feedback: reads the SavedGuide table to route a sitter's feedback to the
// guide's owner (or the team inbox). Also a standalone Lambda URL, same reason.
const savedGuideTable = backend.data.resources.tables["SavedGuide"];
const guideFeedbackTable = backend.data.resources.tables["GuideFeedback"];
const guideFeedbackLambda = backend.guideFeedbackFn.resources.lambda as LambdaFunction;
guideFeedbackLambda.addEnvironment("SAVEDGUIDE_TABLE", savedGuideTable.tableName);
guideFeedbackLambda.addEnvironment("GUIDEFEEDBACK_TABLE", guideFeedbackTable.tableName);
guideFeedbackLambda.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
savedGuideTable.grantReadData(guideFeedbackLambda);
guideFeedbackTable.grantReadWriteData(guideFeedbackLambda); // write on submit, read/delete for the dashboard
// The dashboard's own per-guide analytics (action "stats") reads the Event table.
guideFeedbackLambda.addEnvironment("EVENT_TABLE", eventTable.tableName);
eventTable.grantReadData(guideFeedbackLambda);
const guideFeedbackUrl = guideFeedbackLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ["content-type"],
  },
});

// Speech-to-text for "Talk it out": receives an audio recording and returns its
// transcript (OpenAI Whisper). A standalone Lambda URL so it can take the larger
// audio payloads (up to ~6 MB) that AppSync would reject.
const transcribeLambda = backend.transcribeFn.resources.lambda as LambdaFunction;
const transcribeUrl = transcribeLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ["content-type"],
  },
});

// Share previews: /g/<slug> pages with per-guide OG tags + /g/<slug>/card.png
// share images. The Amplify Hosting rewrite for /g/<*> proxies to this URL.
// Reads the Guide table directly (standalone Lambda URL, same one-directional
// dependency reasoning as the stats function).
const guideTable = backend.data.resources.tables["Guide"];
const ogLambda = backend.ogFn.resources.lambda as LambdaFunction;
ogLambda.addEnvironment("GUIDE_TABLE", guideTable.tableName);
ogLambda.addEnvironment("SITE_ORIGIN", "https://www.gotitguides.com");
guideTable.grantReadData(ogLambda);
const ogUrl = ogLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // serves public pages/images only
});

// Broadcast email: reads recipients (Cognito emails + waitlist Feedback rows),
// writes unsubscribes back as Feedback rows, and serves the GET /unsub link.
const feedbackTable = backend.data.resources.tables["Feedback"];
const broadcastLambda = backend.broadcastFn.resources.lambda as LambdaFunction;
broadcastLambda.addEnvironment("FEEDBACK_TABLE", feedbackTable.tableName);
broadcastLambda.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
feedbackTable.grantReadWriteData(broadcastLambda);
backend.auth.resources.userPool.grant(broadcastLambda, "cognito-idp:ListUsers");
const broadcastUrl = broadcastLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // POST is passphrase-gated; GET /unsub is HMAC-verified
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST, HttpMethod.GET],
    allowedHeaders: ["content-type"],
  },
});

backend.addOutput({ custom: {
  statsFunctionUrl: statsUrl.url,
  broadcastFunctionUrl: broadcastUrl.url,
  guideFeedbackFunctionUrl: guideFeedbackUrl.url,
  transcribeFunctionUrl: transcribeUrl.url,
  // Point the Amplify Hosting /g/<*> 200-rewrite at this URL (+ /g/<*>).
  ogFunctionUrl: ogUrl.url,
  // The CloudFront target to point the auth.gotitguides.com Route 53 alias at.
  authCustomDomainCloudFront: authCustomDomain.attrCloudFrontDistribution,
} });
