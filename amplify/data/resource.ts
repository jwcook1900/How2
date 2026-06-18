import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * How2 data model.
 *
 * A Guide is stored by its friendly slug (used as the record id). `payload`
 * holds the whole guide object as JSON; `editToken` is a secret known only to
 * the creator (it gates the edit UI). Public API-key auth keeps the free tier
 * account-less — this is intentionally soft security for the MVP and will be
 * hardened with real accounts/owner auth in a later phase.
 */
const schema = a.schema({
  Guide: a
    .model({
      editToken: a.string().required(),
      payload: a.json().required(),
    })
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
