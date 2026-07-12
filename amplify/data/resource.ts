import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { aiFn } from "../functions/ai/resource";
import { emailFn } from "../functions/email/resource";
import { feedbackFn } from "../functions/feedback/resource";
import { videoFn } from "../functions/video/resource";
import { welcomeFn } from "../functions/welcome/resource";
import { urlFn } from "../functions/url/resource";

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
  //   status  — "published" today (you only save after publishing); reserved
  //             for a future draft state.
  //   locked  — true if the guide is code-protected (drives the dashboard's
  //             "Public link" vs "Code locked" badge).
  // `updatedAt` is auto-managed by Amplify and powers "Updated N days ago".
  SavedGuide: a
    .model({
      slug: a.string().required(),
      editToken: a.string().required(),
      title: a.string(),
      emoji: a.string(),
      status: a.string(),
      locked: a.boolean(),
      // The owner's email + Cognito sub, so sitter feedback on the published
      // guide can be routed to its creator (email) and shown on their dashboard
      // (matched by sub). Owner-scoped (never exposed in the public guide);
      // read server-side by the guide-feedback function.
      ownerEmail: a.string(),
      ownerSub: a.string(),
      // True once the owner renames the card on their dashboard — from then on
      // the dashboard label is independent and re-publishes stop syncing the
      // guide's cover title over it.
      customTitle: a.boolean(),
    })
    .authorization((allow) => [allow.owner()]),

  // A signed-in user's lightweight profile (just a display name for now, so the
  // dashboard greets them by name instead of showing their email). Owner-scoped.
  UserProfile: a
    .model({
      displayName: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  // A suggestion a sitter left on a creator's published guide. Written by the
  // guide-feedback function with `ownerSub` = the creator's Cognito sub (copied
  // from their SavedGuide). The dashboard reads/dismisses these through that same
  // function, scoped by the caller's verified identity — not via AppSync — so we
  // don't depend on Amplify's owner-field format. The model just defines the
  // table; all access is server-side (IAM), so no client auth path is needed.
  GuideFeedback: a
    .model({
      slug: a.string(),
      title: a.string(),
      message: a.string(),
      fromEmail: a.string(),
      ownerSub: a.string(),
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
      // Anonymous visitor id (a random token the browser keeps in its own
      // localStorage) so views can be counted unique-vs-total. Not personal
      // data — it identifies a browser, not a person.
      vid: a.string(),
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

  // Sends a one-time welcome email to a newly signed-up user. Authenticated
  // only; the Lambda emails the caller's own verified identity (never a
  // client-supplied address). The app calls it once per account.
  sendWelcome: a
    .query()
    .arguments({
      name: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(welcomeFn)),

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

  // Reads a public web page / Google Doc the creator links to and returns its
  // visible text, so "paste a link" can feed the AI import. SSRF-guarded in the
  // handler (public hosts only).
  readUrl: a
    .query()
    .arguments({
      url: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(urlFn)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
