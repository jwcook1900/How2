/* ============================================================
   Share-preview rendering (pure functions, no AWS imports).

   PRIVACY RULE — do not weaken this: a link preview is fetched by
   crawlers with no auth, so it may only ever expose a guide's
   title, subtitle, cover emoji, section TITLES and section count.
   Never body text, contacts, phone numbers, medication details,
   access codes, photos, or the owner's identity. Encrypted
   (code-protected) guides expose only the plaintext title/emoji
   their envelope carries (a deliberate choice made at publish
   time) — the contents are unreadable by design.
   ============================================================ */

export type Preview = {
  kind: "guide" | "protected" | "fallback";
  title: string;
  desc: string;
  emoji: string;        // one grapheme, or ""
  chips: string[];      // up to 4 section titles (used in og:description contexts)
  rows: { icon: string; title: string }[]; // section rows for the card mockup
  sub: string;          // the subtitle alone (desc = sub + section count)
  count: number;        // total named sections
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

// A single trimmed line of text (guards envelope titles against oddities).
export function firstLine(s: unknown): string {
  return String(s == null ? "" : s).split(/[\r\n]/)[0].trim().slice(0, 120);
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
      title: "The handover guide people actually follow.",
      desc: "Create a living guide for your pet, home, family or team — share it with one link.",
      sub: "Create a living guide for your pet, home, family or team — share it with one link.",
      count: 0,
      // The mockup shows the classic example rows (same as the site's own card)
      rows: [
        { icon: "🦴", title: "Feeding & Routine" },
        { icon: "💊", title: "Medication" },
        { icon: "🚨", title: "Vet & Emergency" },
      ],
    };
  }
  // Encrypted envelope: the contents are unreadable by design, but envelopes
  // published since the plaintext-title change carry the guide's name and
  // cover emoji outside the encryption — show those, never anything else.
  if (payload.enc === 1) {
    const lockedName = firstLine(payload.title);
    return {
      kind: "protected",
      emoji: firstGrapheme(String(payload.emoji || "")) || "🔒",
      chips: [], rows: [],
      title: lockedName || "This guide is protected",
      desc: (lockedName ? lockedName + " is protected. " : "This guide is protected. ") +
        "Enter your code to view it.",
      sub: "Protected — enter your code to view it.",
      count: 0,
    };
  }
  const title = String(payload.title || "").trim() || "A GotIt guide";
  const subtitle = String(payload.subtitle || "").trim();
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const named = sections
    .map((s: any) => ({
      icon: firstGrapheme(String((s && s.icon) || "")),
      title: String((s && s.title) || "").trim(),
    }))
    .filter((s: { icon: string; title: string }) => s.title && s.title !== "New section");
  const count = named.length;
  const counted = count ? count + " section" + (count === 1 ? "" : "s") : "";
  return {
    kind: "guide",
    title,
    desc: subtitle
      ? subtitle + (counted ? " · " + counted : "")
      : "Everything they need, in one link." + (counted ? " · " + counted : ""),
    emoji: firstGrapheme(String(payload.emoji || "")),
    chips: named.slice(0, 4).map((s: { title: string }) => truncate(s.title, 24)),
    rows: named.slice(0, 3).map((s: { icon: string; title: string }) => ({
      icon: s.icon, title: truncate(s.title, 22),
    })),
    sub: subtitle || "Everything they need, in one link.",
    count,
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
    '  <link rel="canonical" href="' + esc(meta.url) + '" />\n' +
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

/* ---- the 1200x630 card ----
   Modelled on the site's original share image: full-bleed brand gradient,
   wordmark + big white headline on the left, and a miniature guide card on
   the right — filled with the guide's real emoji, title and section rows. */

const W = 1200, H = 630;
const INK = "#1A1A1A", MUTED = "#8B847C", LINE = "#EDE8E2";
const CORAL = "#ED7446", AMBER = "#FFB347", PAPER = "#FFFDFB";

// Strip a twemoji SVG's outer tag and place it at (x,y) sized to `px`.
function emojiAt(svg: string | null, x: number, y: number, px: number): string {
  if (!svg) return "";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return '<g transform="translate(' + x + "," + y + ") scale(" + (px / 36) + ')">' + inner + "</g>";
}

// Greedy word-wrap into at most `maxLines` lines of ~`maxChars`, ellipsizing.
function wrapLines(s: string, maxChars: number, maxLines: number): string[] {
  const words = String(s || "").trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur ? cur + " " + w : w).length <= maxChars) { cur = cur ? cur + " " + w : w; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines || (cur && lines.length === maxLines && lines.indexOf(cur) < 0)) {
    lines.length = maxLines;
    lines[maxLines - 1] = truncate(lines[maxLines - 1] + "…", maxChars + 1);
  }
  return lines.length ? lines : [truncate(s, maxChars)];
}

export type CardArt = { cover: string | null; icons: (string | null)[] };

export function buildCardSvg(p: Preview, art: CardArt): string {
  // ---- right: the mini guide card (its own coordinate system) ----
  const CX = 760, CY = 64, CW = 368, CH = 502, MID = CX + CW / 2;
  const headerH = p.emoji || p.kind !== "guide" ? 190 : 150;

  let mini = "";
  // header: gradient block with the guide's emoji + name, like a real cover
  mini += '<rect x="' + CX + '" y="' + CY + '" width="' + CW + '" height="' + headerH + '" fill="url(#bg2)"/>';
  const miniTitle = truncate(p.kind === "fallback" ? "Whiskey's Care Guide" : p.title, 20);
  const emojiPx = 76;
  if (art.cover) {
    mini += emojiAt(art.cover, MID - emojiPx / 2, CY + 26, emojiPx);
    mini += '<text x="' + MID + '" y="' + (CY + 142) + '" text-anchor="middle" font-size="27" font-weight="800" fill="#fff">' + esc(miniTitle) + "</text>";
    mini += '<text x="' + MID + '" y="' + (CY + 172) + '" text-anchor="middle" font-size="16" font-weight="400" fill="rgba(255,255,255,0.9)">' +
      esc(truncate(p.sub, 34)) + "</text>";
  } else {
    mini += '<text x="' + MID + '" y="' + (CY + Math.round(headerH / 2) + 2) + '" text-anchor="middle" font-size="28" font-weight="800" fill="#fff">' + esc(miniTitle) + "</text>";
    mini += '<text x="' + MID + '" y="' + (CY + Math.round(headerH / 2) + 34) + '" text-anchor="middle" font-size="16" font-weight="400" fill="rgba(255,255,255,0.9)">' +
      esc(truncate(p.sub, 34)) + "</text>";
  }
  // section rows (the guide's real sections)
  const rows = p.rows.slice(0, 3);
  let ry = CY + headerH + 34;
  rows.forEach((r, i) => {
    const iconSvg = art.icons[i] || null;
    if (iconSvg) mini += emojiAt(iconSvg, CX + 30, ry - 22, 32);
    else mini += '<circle cx="' + (CX + 46) + '" cy="' + (ry - 6) + '" r="6" fill="' + CORAL + '"/>';
    mini += '<text x="' + (CX + 78) + '" y="' + ry + '" font-size="22" font-weight="700" fill="' + INK + '">' + esc(r.title) + "</text>";
    if (i < rows.length - 1) {
      mini += '<line x1="' + (CX + 28) + '" y1="' + (ry + 30) + '" x2="' + (CX + CW - 28) + '" y2="' + (ry + 30) + '" stroke="' + LINE + '" stroke-width="2"/>';
    }
    ry += 64;
  });
  if (!rows.length) {
    mini += '<text x="' + MID + '" y="' + (ry + 10) + '" text-anchor="middle" font-size="20" font-weight="600" fill="' + MUTED + '">' +
      esc(p.kind === "protected" ? "Enter your code to view it" : "Open the guide →") + "</text>";
  }
  // "+ n more" hint when the guide has more sections than the mockup shows
  const more = Math.max(0, (p.count || 0) - rows.length);
  if (more > 0 && rows.length) {
    mini += '<text x="' + MID + '" y="' + (ry + 6) + '" text-anchor="middle" font-size="19" font-weight="600" fill="' + MUTED + '">+ ' + more + " more section" + (more === 1 ? "" : "s") + "</text>";
  }

  // ---- left: wordmark, headline (up to 2 lines), subtitle, url ----
  const maxW = 600;
  let size = 62;
  let lines = wrapLines(p.title, Math.floor(maxW / (size * 0.62)), 2);
  if (lines.length > 1 || p.title.length > 18) {
    size = 52;
    lines = wrapLines(p.title, Math.floor(maxW / (size * 0.62)), 2);
  }
  const titleY = lines.length > 1 ? 252 : 282;
  const titleSvg = lines.map((ln, i) =>
    '<text x="84" y="' + (titleY + i * (size + 14)) + '" font-size="' + size + '" font-weight="800" fill="#fff">' + esc(ln) + "</text>"
  ).join("");
  const subY = titleY + (lines.length - 1) * (size + 14) + 58;
  const counted = p.count ? " · " + p.count + " section" + (p.count === 1 ? "" : "s") : "";
  const subMax = Math.floor(maxW / (28 * 0.52));
  const subtitle = truncate(p.sub, Math.max(12, subMax - counted.length)) + counted;

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    "<defs>" +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#F79E6B"/><stop offset="0.6" stop-color="' + CORAL + '"/><stop offset="1" stop-color="#D65F33"/>' +
      "</linearGradient>" +
      '<linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + CORAL + '"/><stop offset="1" stop-color="' + AMBER + '"/>' +
      "</linearGradient>" +
      '<clipPath id="mini"><rect x="' + CX + '" y="' + CY + '" width="' + CW + '" height="' + CH + '" rx="26"/></clipPath>' +
      '<filter id="sh" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#7a2603" flood-opacity="0.4"/>' +
      "</filter>" +
    "</defs>" +
    '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
    '<g font-family="Plus Jakarta Sans">' +
      // left column
      '<text x="84" y="128" font-size="28" font-weight="800" fill="#fff">GotIt Guides<tspan fill="' + AMBER + '"> ●</tspan></text>' +
      titleSvg +
      '<text x="84" y="' + subY + '" font-size="28" font-weight="400" fill="rgba(255,255,255,0.94)">' + esc(subtitle) + "</text>" +
      '<text x="84" y="556" font-size="24" font-weight="600" fill="rgba(255,255,255,0.85)">gotitguides.com</text>' +
      // right mini card: shadow base, then clipped contents
      '<rect x="' + CX + '" y="' + CY + '" width="' + CW + '" height="' + CH + '" rx="26" fill="' + PAPER + '" filter="url(#sh)"/>' +
      '<g clip-path="url(#mini)">' +
        '<rect x="' + CX + '" y="' + CY + '" width="' + CW + '" height="' + CH + '" fill="' + PAPER + '"/>' +
        mini +
      "</g>" +
    "</g>" +
  "</svg>";
}
