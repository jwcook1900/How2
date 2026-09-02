import { lookup } from "dns/promises";
import type { Schema } from "../../data/resource";

const MAX_BYTES = 2_000_000;   // don't slurp huge pages
const MAX_TEXT = 16000;        // plenty for the AI import (it caps again)
const MAX_REDIRECTS = 3;
const FETCH_MS = 12000;

// ---- SSRF guard: refuse anything that isn't a public host ----
function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n) || n < 0 || n > 255)) return true; // malformed → refuse
  const [a, b] = p;
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 127) return true;                      // loopback
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 169 && b === 254) return true;         // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true;           // 192.0.0.0/24 + test nets
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                       // multicast + reserved
  return false;
}
function ipPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.indexOf(":") === -1) return ipv4Private(v);
  // IPv6
  if (v === "::1" || v === "::") return true;                 // loopback / unspecified
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / ULA
  if (v.startsWith("ff")) return true;                        // multicast
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);     // IPv4-mapped
  if (mapped) return ipv4Private(mapped[1]);
  return false;
}
async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const recs = await lookup(host, { all: true });
    if (!recs.length) return false;
    return recs.every((r) => !ipPrivate(r.address));
  } catch (e) {
    return false;
  }
}

// Google Docs "edit" links are a JS app; their public export endpoint is plain
// text. Rewrite so we read the actual document, not the editor shell.
function normalizeUrl(raw: string): string {
  const m = raw.match(/^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return "https://docs.google.com/document/d/" + m[1] + "/export?format=txt";
  return raw;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n); } catch { return " "; } });
}
function htmlToText(html: string): { title: string; text: string } {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? decodeEntities(t[1]).replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return { title, text: decodeEntities(text).replace(/[ \t\f\v]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim() };
}

// Validate a single hop and return its resolved-as-public URL object, or null.
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!(await hostIsPublic(u.hostname))) return null;
  return u;
}

export const handler: Schema["readUrl"]["functionHandler"] = async (event) => {
  const raw = (event.arguments.url || "").trim();
  if (!raw) return { ok: false, error: "No link provided." };
  if (raw.length > 2000) return { ok: false, error: "That link is too long." };

  let current = normalizeUrl(raw);
  let resp: Response | null = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await safeUrl(current);
      if (!u) return { ok: false, error: "That link can't be read (it must be a public web address)." };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
      let r: Response;
      try {
        r = await fetch(u.toString(), {
          method: "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": "GotItGuidesBot/1.0 (+https://www.gotitguides.com)", "accept": "text/html,text/plain" },
        });
      } finally { clearTimeout(timer); }
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return { ok: false, error: "Couldn't follow that link." };
        current = new URL(loc, u).toString(); // re-validated at the top of the loop
        continue;
      }
      resp = r;
      break;
    }
  } catch (e) {
    return { ok: false, error: "Couldn't reach that link." };
  }
  if (!resp) return { ok: false, error: "That link redirected too many times." };
  if (!resp.ok) return { ok: false, error: "That page couldn't be opened (" + resp.status + ")." };

  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (ct && !/text\/html|text\/plain|application\/xhtml/.test(ct)) {
    return { ok: false, error: "That link isn't a readable web page. Try a public web page or Google Doc." };
  }

  // Read up to MAX_BYTES.
  const reader = resp.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (received > MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
      }
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const body = buf.toString("utf8");

  const isHtml = /html|xhtml/.test(ct) || /<html|<body|<div|<p[ >]/i.test(body.slice(0, 2000));
  const out = isHtml ? htmlToText(body) : { title: "", text: body.replace(/[ \t\f\v]+/g, " ").trim() };
  const text = out.text.slice(0, MAX_TEXT);
  if (text.replace(/\s/g, "").length < 40) {
    return { ok: false, error: "We couldn't find readable text there — some sites (like Airbnb) load their content with JavaScript. Try copying the text and pasting it instead." };
  }
  return { ok: true, title: out.title, text };
};
