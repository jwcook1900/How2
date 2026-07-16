/* ============================================================
   Share-preview proxy for /g/<slug> (Lambda Function URL).

   Amplify Hosting's /g/<*> rewrite points here instead of at the
   static guide.html. Two routes:

     GET /g/<slug>            → guide.html with per-guide OG/twitter
                                meta injected server-side (crawlers
                                don't run JS, so this is the only
                                place previews can be personalised)
     GET /g/<slug>/card.png   → 1200x630 share card, drawn on demand

   PRIVACY RULE (see render.ts): previews only ever expose title,
   subtitle, emoji, section titles and section count. Encrypted
   guides render a neutral "protected" card.

   NEVER-500 RULE: a failed preview must degrade, not break the
   page. The HTML route falls back to redirecting to the static
   /guide.html?g=<slug> (which guide.js understands); the image
   route falls back to the static generic /images/og.png.
   ============================================================ */
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { derivePreview, injectMeta, buildCardSvg, twemojiFile, Preview } from "./render";

const ddb = new DynamoDBClient({});
const SITE = (process.env.SITE_ORIGIN || "https://www.gotitguides.com").replace(/\/$/, "");
const TWEMOJI_BASE = process.env.TWEMOJI_BASE ||
  "https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/";

/* ---- warm-container caches ---- */
let tpl: { html: string; at: number } | null = null;      // guide.html template
let fontsP: Promise<Uint8Array[]> | null = null;          // brand font buffers
let wasmP: Promise<void> | null = null;                   // resvg wasm init
const emojiCache = new Map<string, string | null>();      // twemoji svg markup
const pngCache = new Map<string, Buffer>();               // slug|v → png

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function template(): Promise<string> {
  if (tpl && Date.now() - tpl.at < 5 * 60 * 1000) return tpl.html;
  const r = await fetch(SITE + "/guide.html");
  if (!r.ok) throw new Error("template " + r.status);
  const html = await r.text();
  if (html.indexOf("</head>") < 0) throw new Error("template malformed");
  tpl = { html, at: Date.now() };
  return html;
}

function ensureRenderer(): { fonts: Promise<Uint8Array[]>; wasm: Promise<void> } {
  if (!fontsP) {
    fontsP = Promise.all([
      fetchBytes(SITE + "/og-assets/Jakarta-ExtraBold.ttf"),
      fetchBytes(SITE + "/og-assets/Jakarta-SemiBold.ttf"),
      fetchBytes(SITE + "/og-assets/Jakarta-Regular.ttf"),
    ]).catch((e) => { fontsP = null; throw e; });
  }
  if (!wasmP) {
    wasmP = fetchBytes(SITE + "/og-assets/resvg.wasm")
      .then((b) => initWasm(b))
      .catch((e) => { wasmP = null; throw e; });
  }
  return { fonts: fontsP, wasm: wasmP };
}

async function emojiSvg(emoji: string): Promise<string | null> {
  if (!emoji) return null;
  const file = twemojiFile(emoji);
  if (!/^[0-9a-f-]{2,60}$/.test(file)) return null;
  if (emojiCache.has(file)) return emojiCache.get(file) || null;
  let svg: string | null = null;
  try {
    const r = await fetch(TWEMOJI_BASE + file + ".svg");
    if (r.ok) {
      const t = await r.text();
      if (t.indexOf("<svg") >= 0 && t.length < 200000) svg = t;
    }
  } catch (e) { /* card renders without the emoji */ }
  emojiCache.set(file, svg);
  return svg;
}

// A guide record, or null when the slug doesn't resolve. `payload` may be an
// encrypted envelope — derivePreview handles that. Depending on AppSync's
// AWSJSON handling the payload sits in DynamoDB either as a JSON *string*
// or as a native document map — accept both.
async function loadGuide(slug: string): Promise<{ payload: any; updatedAt: number } | null> {
  const table = process.env.GUIDE_TABLE;
  if (!table || !slug) return null;
  const res: any = await ddb.send(new GetItemCommand({
    TableName: table,
    Key: { id: { S: slug } },
    ProjectionExpression: "payload, updatedAt",
  }));
  if (!res.Item || !res.Item.payload) return null;
  let it: any;
  try { it = unmarshall(res.Item); } catch (e) { return null; }
  let payload: any = it.payload;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (e) { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  const upd = Date.parse(String(it.updatedAt || "")) || 0;
  return { payload, updatedAt: upd };
}

function resp(status: number, headers: Record<string, string>, body: string, b64?: boolean) {
  return { statusCode: status, headers, body, isBase64Encoded: !!b64 };
}

export const handler = async (event: any) => {
  const rawPath: string = (event && event.rawPath) || "/";
  const m = rawPath.match(/^\/g\/([^/]+)(\/card\.png)?/);
  const slug = m ? decodeURIComponent(m[1]) : "";
  const wantsCard = !!(m && m[2]);

  /* ---- the share-card image ---- */
  if (wantsCard) {
    try {
      const v = String((event.queryStringParameters || {}).v || "");
      const cacheKey = slug + "|" + v;
      let png = pngCache.get(cacheKey);
      if (!png) {
        const g = await loadGuide(slug).catch(() => null);
        const p: Preview = derivePreview(g ? g.payload : null, "GotIt Guides");
        const { fonts, wasm } = ensureRenderer();
        const [fontBufs, , em] = await Promise.all([fonts, wasm, emojiSvg(p.emoji)]);
        const svg = buildCardSvg(p, em);
        const r = new Resvg(svg, {
          font: { fontBuffers: fontBufs as any, defaultFontFamily: "Plus Jakarta Sans" },
        });
        png = Buffer.from(r.render().asPng());
        if (pngCache.size > 60) pngCache.clear();
        pngCache.set(cacheKey, png);
      }
      return resp(200, {
        "content-type": "image/png",
        // Long-lived: guide edits change updatedAt, which changes the ?v=
        // the HTML points at, so stale cached images stop being referenced.
        "cache-control": "public, max-age=86400",
      }, png.toString("base64"), true);
    } catch (e) {
      // Never a broken image: hand crawlers the generic static card instead.
      return resp(302, { location: SITE + "/images/og.png", "cache-control": "public, max-age=60" }, "");
    }
  }

  /* ---- the guide page with injected metadata ---- */
  try {
    const html = await template();
    const g = slug ? await loadGuide(slug).catch(() => null) : null;
    let out = html;
    if (g) {
      const p = derivePreview(g.payload, "GotIt Guides");
      out = injectMeta(html, {
        title: p.kind === "guide" ? p.title + " · GotIt Guides" : p.title,
        desc: p.desc,
        url: SITE + "/g/" + encodeURIComponent(slug),
        image: SITE + "/g/" + encodeURIComponent(slug) + "/card.png" +
          (g.updatedAt ? "?v=" + g.updatedAt : ""),
      });
    }
    // Unknown slug: the untouched template (generic tags); guide.js shows its
    // own not-found state. 200 keeps stale links rendering a friendly page.
    return resp(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    }, out);
  } catch (e) {
    // Template unreachable — fall back to the static page via query-param
    // routing, which guide.js supports (?g=<slug>).
    return resp(302, {
      location: SITE + "/guide.html?g=" + encodeURIComponent(slug),
      "cache-control": "public, max-age=60",
    }, "");
  }
};
