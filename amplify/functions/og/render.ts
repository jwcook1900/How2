/* ============================================================
   Share-preview rendering (pure functions, no AWS imports).

   PRIVACY RULE — do not weaken this: a link preview is fetched by
   crawlers with no auth, so it may only ever expose a guide's
   title, subtitle, cover emoji, section TITLES and section count.
   Never body text, contacts, phone numbers, medication details,
   access codes, photos, or the owner's identity. Encrypted
   (code-protected) guides expose nothing but a neutral
   "protected" card — their payload is unreadable by design.
   ============================================================ */

export type Preview = {
  kind: "guide" | "protected" | "fallback";
  title: string;
  desc: string;
  emoji: string;        // one grapheme, or ""
  chips: string[];      // up to 4 section titles
};

/* ---- text helpers ---- */

// Escape for HTML/XML text AND attribute values.
export function esc(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function truncate(s: string, max: number): string {
  s = String(s || "").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// First grapheme of a string (so "🐶🦴" → "🐶", flags/ZWJ emoji stay whole).
export function firstGrapheme(s: string): string {
  s = String(s || "").trim();
  if (!s) return "";
  try {
    const seg = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
    for (const g of seg.segment(s)) return g.segment;
  } catch (e) { /* older runtimes */ }
  return Array.from(s)[0] || "";
}

// Twemoji asset name for an emoji: codepoints joined by "-", dropping the
// FE0F variation selector when there's no ZWJ (twemoji's file-naming rule).
export function twemojiFile(emoji: string): string {
  const cps = Array.from(emoji).map((c) => c.codePointAt(0) as number);
  const seq = emoji.indexOf("‍") < 0 ? cps.filter((c) => c !== 0xfe0f) : cps;
  return seq.map((c) => c.toString(16)).join("-");
}

/* ---- derive what a preview may show from a guide payload ---- */

export function derivePreview(payload: any, siteName: string): Preview {
  if (!payload) {
    return {
      kind: "fallback", emoji: "🧡", chips: [],
      title: siteName,
      desc: "Care guides you share with one link — routines, contacts and everything they need.",
    };
  }
  // Encrypted envelope: the server cannot read it, and must not pretend to.
  if (payload.enc === 1) {
    return {
      kind: "protected", emoji: "🔒", chips: [],
      title: "This guide is protected",
      desc: "This guide is protected. Enter your code to view it.",
    };
  }
  const title = String(payload.title || "").trim() || "A GotIt guide";
  const subtitle = String(payload.subtitle || "").trim();
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const names = sections
    .map((s: any) => String((s && s.title) || "").trim())
    .filter((t: string) => t && t !== "New section");
  const count = names.length;
  const counted = count ? count + " section" + (count === 1 ? "" : "s") : "";
  return {
    kind: "guide",
    title,
    desc: subtitle
      ? subtitle + (counted ? " · " + counted : "")
      : "Everything they need, in one link." + (counted ? " · " + counted : ""),
    emoji: firstGrapheme(String(payload.emoji || "")),
    chips: names.slice(0, 4).map((t: string) => truncate(t, 24)),
  };
}

/* ---- server-rendered <head> metadata ---- */

// Strip the template's static title/og/twitter tags and inject per-guide ones.
// Everything else in the template is left byte-for-byte intact.
export function injectMeta(
  template: string,
  meta: { title: string; desc: string; url: string; image: string }
): string {
  const block =
    "<title>" + esc(meta.title) + "</title>\n" +
    '  <meta property="og:title" content="' + esc(meta.title) + '" />\n' +
    '  <meta property="og:description" content="' + esc(meta.desc) + '" />\n' +
    '  <meta property="og:type" content="website" />\n' +
    '  <meta property="og:site_name" content="GotIt Guides" />\n' +
    '  <meta property="og:url" content="' + esc(meta.url) + '" />\n' +
    '  <meta property="og:image" content="' + esc(meta.image) + '" />\n' +
    '  <meta property="og:image:width" content="1200" />\n' +
    '  <meta property="og:image:height" content="630" />\n' +
    '  <meta name="twitter:card" content="summary_large_image" />\n' +
    '  <meta name="twitter:title" content="' + esc(meta.title) + '" />\n' +
    '  <meta name="twitter:description" content="' + esc(meta.desc) + '" />\n' +
    '  <meta name="twitter:image" content="' + esc(meta.image) + '" />';
  return template
    .replace(/^[ \t]*<title>[\s\S]*?<\/title>\s*$/m, "")
    .replace(/^[ \t]*<meta (?:property="og:|name="twitter:)[^>]*\/?>\s*$/gm, "")
    .replace(/<head>/, "<head>\n  " + block);
}

/* ---- the 1200x630 card ---- */

const W = 1200, H = 630;
const INK = "#2B2320", MUTED = "#8A7A72", CHIP_INK = "#6B5B52";
const CORAL = "#FF6B35", TINT = "#FFF4EE", PAPER = "#FFFDFB";

// `emojiSvg` is the raw twemoji SVG markup (trusted asset), or null.
export function buildCardSvg(p: Preview, emojiSvg: string | null): string {
  const hasEmoji = !!emojiSvg;
  const left = hasEmoji ? 270 : 90;
  const maxTextW = 1100 - left;

  // Title: one line, sized down once for longer names, then ellipsized.
  // Width estimate: Jakarta ExtraBold averages ~0.62em per character.
  let size = 64;
  let maxChars = Math.floor(maxTextW / (size * 0.62));
  if (p.title.length > maxChars) {
    size = 50;
    maxChars = Math.floor(maxTextW / (size * 0.62));
  }
  const title = truncate(p.title, maxChars);
  // Jakarta Regular at 30px averages ~0.52em per character.
  const subtitle = truncate(p.desc, Math.floor(maxTextW / (30 * 0.52)));

  // Emoji block: twemoji is a 36x36 viewBox; strip its outer <svg> and place it.
  let emojiG = "";
  if (emojiSvg) {
    const inner = emojiSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    emojiG = '<g transform="translate(84,86) scale(4.3)">' + inner + "</g>";
  }

  // Section chips: one row, drop whatever doesn't fit.
  let chips = "";
  let x = 90;
  const chipY = hasEmoji ? 330 : 330;
  for (const c of p.chips) {
    const w = Math.round(52 + c.length * 13.2);
    if (x + w > 1116) break;
    chips +=
      '<rect x="' + x + '" y="' + chipY + '" width="' + w + '" height="56" rx="28" fill="' + TINT + '"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (chipY + 37) + '" text-anchor="middle" font-size="24" font-weight="600" fill="' + CHIP_INK + '">' + esc(c) + "</text>";
    x += w + 18;
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    "<defs>" +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#FF8A5C"/><stop offset="1" stop-color="' + CORAL + '"/>' +
      "</linearGradient>" +
    "</defs>" +
    '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
    '<rect x="40" y="40" width="' + (W - 80) + '" height="' + (H - 80) + '" rx="28" fill="' + PAPER + '"/>' +
    emojiG +
    '<g font-family="Plus Jakarta Sans">' +
      '<text x="' + left + '" y="' + (hasEmoji ? 165 : 170) + '" font-size="' + size + '" font-weight="800" fill="' + INK + '">' + esc(title) + "</text>" +
      '<text x="' + left + '" y="' + (hasEmoji ? 222 : 230) + '" font-size="30" font-weight="400" fill="' + MUTED + '">' + esc(subtitle) + "</text>" +
      chips +
      '<text x="90" y="562" font-size="24" font-weight="600" fill="' + MUTED + '">gotitguides.com</text>' +
      '<text x="1110" y="562" font-size="26" font-weight="800" fill="' + CORAL + '" text-anchor="end">GotIt Guides</text>' +
    "</g>" +
    // Small heart to the left of the wordmark (emoji glyphs don't rasterise
    // in resvg, so it's drawn as a path).
    '<path transform="translate(896,538) scale(1.15)" fill="' + CORAL + '" ' +
      'd="M12 21s-8-4.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-8 11-8 11z"/>' +
  "</svg>";
}
