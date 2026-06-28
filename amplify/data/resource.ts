import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { aiFn } from "../functions/ai/resource";
import { emailFn } from "../functions/email/resource";
import { feedbackFn } from "../functions/feedback/resource";
import { videoFn } from "../functions/video/resource";

/**
 * GotIt Guides data model.
 *
 * A Guide is stored by its friendly slug (used as the record id). `payload`
 * holds the whole guide object as JSON; `editToken` is a secret known only to
 * the creator (it gates the edit UI). Public API-key auth keeps the free tier
 * account-less — this is intentionally soft security for the MVP and will be
 * hardened with real accounts/owner auth in a later phase.
 *
 * `aiAssist` is a server-side AI helper (keyless for the client) used for
 * Polish and notes import.
 */
const schema = a.schema({
  Guide: a
    .model({
      editToken: a.string().required(),
      payload: a.json().required(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // A signed-in user's saved guides (the "My Guides" dashboard). Owner-scoped:
  // only the owner can read/write their own rows. Stores the slug + edit token
  // so the dashboard can link straight to viewing/editing. The Guide model
  // itself is unchanged and still fully account-less.
  SavedGuide: a
    .model({
      slug: a.string().required(),
      editToken: a.string().required(),
      title: a.string(),
      emoji: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  // In-app feedback from the creation journey. Create-only for the public so
  // submissions can't be listed/read back by other visitors.
  Feedback: a
    .model({
      message: a.string().required(),
      email: a.string(),
      context: a.string(), // which step / category / page the feedback came from
    })
    .authorization((allow) => [allow.publicApiKey().to(["create"])]),

  // First-party analytics events (no personal data): kind = publish/view/share,
  // slug = the guide it relates to. Create-only for the public; read is via the
  // passphrase-protected getStats function below.
  Event: a
    .model({
      kind: a.string().required(),
      slug: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey().to(["create"])]),

  aiAssist: a
    .query()
    .arguments({
      mode: a.string().required(),
      text: a.string(),
      category: a.string(),
      question: a.string(),
      fileData: a.string(),
      fileType: a.string(),
      // Multiple attachments (e.g. several photos of handwritten notes) for the
      // import flow. Single fileData/fileType above is still used for per-field reads.
      fileDatas: a.string().array(),
      fileTypes: a.string().array(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(aiFn)),

  // Emails a creator their guide links (and password, if set) at publish time.
  sendLinks: a
    .query()
    .arguments({
      email: a.string().required(),
      slug: a.string().required(),
      editToken: a.string().required(),
      origin: a.string().required(),
      title: a.string(),
      emoji: a.string(),
      password: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(emailFn)),

  // Emails a piece of in-app feedback to the team (feedback is also stored in
  // the Feedback model above for durability).
  sendFeedback: a
    .query()
    .arguments({
      message: a.string().required(),
      email: a.string(),
      context: a.string(),
      image: a.string(),     // optional screenshot (base64)
      imageType: a.string(), // its mime type
    })
    .returns(a.json())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(feedbackFn)),

  // Issues a one-time Cloudflare Stream upload URL so creators can upload a
  // video from their phone (Cloudflare transcodes it to play on any device).
  videoUpload: a
    .query()
    .arguments({
      maxDurationSeconds: a.integer(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(videoFn)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
