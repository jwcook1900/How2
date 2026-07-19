# GotIt Guides

Static HTML/CSS/JS site (no framework, no build step) + AWS Amplify Gen 2 backend
(`amplify/`). Root-served: there is no `public/` — assets live at the repo root.
Deploys ride the Amplify GitHub integration; the production branch is
`claude/ecstatic-einstein-i3ewvk` (cherry-pick from the dev branch, never merge).

## Brand

Assets live in `brand/`. Never recreate the logo in HTML/CSS text; always use the SVG.
- Light backgrounds: `brand/logo-primary.svg`
- Dark or orange backgrounds: `brand/logo-reversed.svg`
- Clear space around the logo: at least the cap height of the G

Colours are tokens (defined in `css/styles.css :root`), never hardcoded hex:
- `--color-ink` #1A1A1A - text and dark surfaces
- `--color-orange` #ED7446 - accent only, never body text
- `--color-cream` #FAFAF8 - default page background
- `--coral` is a legacy alias that now points at `--color-orange` (repointed
  July 2026, owner-approved); `--coral-dark` #D65F33 is the hover/darker shade.
  Prefer the `--color-*` tokens in new code.

Typeface is Plus Jakarta Sans everywhere (`--font-brand`). Headlines Bold, body Medium/Regular.

Signature device: headlines that complete a sentence end with an orange full stop.
Example: "Explain it once. Now they've got it." with the full stops in orange.

Voice: warm, human, slightly playful, never corporate. First person. Specific detail
over abstraction. Australian English. No em dashes in new copy. Sentence case, not
title case.

The product name is written "GotIt Guides" in copy, capital G and capital I.

Do not: gradients or drop shadows in NEW surfaces (existing ones are grandfathered
until the owner schedules a refresh), stock photography of people at laptops, a
second accent colour, or any restyling of the logo.

Share/OG cards and favicons follow the same tokens. The favicon is the "G." mark on
ink; do not substitute a plain G.

## Privacy rules (load-bearing — copy and code must match them)

- Guides are unlisted; anyone with the link can open them unless a guide code is set.
- Locked guides are encrypted on-device; the server never sees contents, only the
  envelope's plaintext title/emoji.
- Share previews expose only title, subtitle, emoji, section TITLES and count —
  never body text, contacts, medication details, or photos.
- Analytics are first-party and anonymous: referrer domain only, random visitor id.
- Marketing email only to account holders (inferred consent + unsubscribe) and
  waitlist (express consent). Never sitters/recipients.
