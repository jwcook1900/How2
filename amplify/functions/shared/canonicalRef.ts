/* Collapse referrer-domain variants into one canonical channel so the stats
   pages rank sources truthfully: m./l./lm./www. Facebook shims all read as
   "facebook.com", Android in-app referrers (reverse-DNS package names) map to
   their site. Raw domains stay untouched in the Event table — this is
   display-time aggregation only. */

const APP_REFERRERS: Record<string, string> = {
  "com.reddit.frontpage": "reddit.com",
  "com.facebook.katana": "facebook.com",
  "com.facebook.orca": "facebook.com",
  "com.instagram.android": "instagram.com",
  "com.google.android.googlequicksearchbox": "google.com",
  "com.linkedin.android": "linkedin.com",
  "com.twitter.android": "x.com",
  "com.pinterest": "pinterest.com",
  "org.telegram.messenger": "telegram.org",
};

// Second-level public suffixes where the registrable domain is three labels
// (smh.com.au, bbc.co.uk, abc.net.au …).
const SECOND_LEVEL = ["com", "co", "net", "org", "gov", "edu", "ac"];

export function canonicalRef(r: string): string {
  if (!r || r === "direct") return r;
  if (APP_REFERRERS[r]) return APP_REFERRERS[r];
  const parts = r.split(".");
  if (parts.length <= 2) return r;
  return SECOND_LEVEL.indexOf(parts[parts.length - 2]) >= 0
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}
