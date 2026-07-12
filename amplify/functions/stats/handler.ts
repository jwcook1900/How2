import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({});
const HEADERS = { "content-type": "application/json" };

/**
 * Lambda Function URL handler (not a GraphQL resolver — that would create a
 * circular dependency with the data stack). Reads first-party analytics from
 * the Event table and returns aggregates. Protected by a passphrase.
 *
 * POST { "key": "<passphrase>" } → { publishes, views, shares, topGuides }.
 */
export const handler = async (event: any) => {
  try {
    if (event && event.requestContext && event.requestContext.http &&
        event.requestContext.http.method === "OPTIONS") {
      return { statusCode: 204, headers: HEADERS, body: "" };
    }

    let raw = event && event.body;
    if (event && event.isBase64Encoded && raw) raw = Buffer.from(raw, "base64").toString("utf8");
    let key = "", tz = 0;
    try {
      const b = JSON.parse(raw || "{}");
      key = (b.key || "").trim();
      tz = Math.max(-840, Math.min(840, Number(b.tz) || 0)); // caller's Date.getTimezoneOffset()
    } catch (e) { key = ""; }

    const secret = process.env.STATS_KEY || "";
    if (!secret) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: "not configured" }) };
    if (key !== secret) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "wrong passphrase" }) };

    const table = process.env.EVENT_TABLE;
    if (!table) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "table not set" }) };

    let publishes = 0, views = 0, shares = 0;
    // Per-guide tallies (keyed by slug) so we can break analytics down by guide.
    const viewsBySlug: Record<string, number> = {};
    const sharesBySlug: Record<string, number> = {};
    const publishesBySlug: Record<string, number> = {};
    const featsBySlug: Record<string, Set<string>> = {}; // slug -> set of feature names
    const lastBySlug: Record<string, string> = {};       // slug -> latest ISO timestamp
    // When a guide came into being: its first publish event (publish is only
    // logged on first publish), falling back to the earliest event of any kind
    // for guides that predate publish logging.
    const createdBySlug: Record<string, string> = {};
    const firstSeenBySlug: Record<string, string> = {};
    // Daily view timelines, bucketed into the caller's local days.
    const DAYS = 30;
    const localDay = (iso: string) => {
      const t = Date.parse(iso);
      return isNaN(t) ? "" : new Date(t - tz * 60000).toISOString().slice(0, 10);
    };
    const dayAxis: string[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      dayAxis.push(new Date(Date.now() - tz * 60000 - i * 86400000).toISOString().slice(0, 10));
    }
    const viewsDayTotal: Record<string, number> = {};
    const viewsDayBySlug: Record<string, Record<string, number>> = {};
    // Unique visitors (distinct anonymous vids on view events; older events
    // carry none, so uniques are a floor for history and exact from now on).
    const uniqAll = new Set<string>();
    const uniqBySlug: Record<string, Set<string>> = {};
    const uniqDayTotal: Record<string, Set<string>> = {};
    // How guides are started (totals) and which features they use (distinct
    // guides — a Set of slugs per feature, so re-publishes don't double-count).
    const startMethods: Record<string, number> = { talk: 0, paste: 0, scratch: 0, photo: 0 };
    const featSlugs: Record<string, Set<string>> = {};
    // Traffic sources: referrer domain (or "direct") on view events. Events
    // from before ref tracking shipped carry none and simply aren't counted.
    const refCounts: Record<string, number> = {};
    const refBySlug: Record<string, Record<string, number>> = {};
    // Creation funnel: builder opened -> category picked -> method chosen ->
    // draft built (distinct editor slugs) -> published (distinct publish slugs).
    let builderOpens = 0;
    const catCounts: Record<string, number> = {};
    const editorSlugs = new Set<string>();
    let startKey: Record<string, any> | undefined = undefined;
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: table,
        ProjectionExpression: "#k, slug, createdAt, vid, #r",
        ExpressionAttributeNames: { "#k": "kind", "#r": "ref" },
        ExclusiveStartKey: startKey,
      }));
      for (const item of res.Items || []) {
        const kind = (item.kind && item.kind.S) || "";
        const slug = (item.slug && item.slug.S) || "";
        const ca = (item.createdAt && item.createdAt.S) || "";
        if (slug && ca && ca > (lastBySlug[slug] || "")) lastBySlug[slug] = ca;
        if (slug && ca && (!firstSeenBySlug[slug] || ca < firstSeenBySlug[slug])) firstSeenBySlug[slug] = ca;
        if (kind === "publish") {
          publishes++;
          if (slug) {
            publishesBySlug[slug] = (publishesBySlug[slug] || 0) + 1;
            if (ca && (!createdBySlug[slug] || ca < createdBySlug[slug])) createdBySlug[slug] = ca;
          }
        } else if (kind === "share") {
          shares++;
          if (slug) sharesBySlug[slug] = (sharesBySlug[slug] || 0) + 1;
        } else if (kind === "view") {
          views++;
          if (slug) viewsBySlug[slug] = (viewsBySlug[slug] || 0) + 1;
          const vid = (item.vid && item.vid.S) || "";
          if (vid) {
            uniqAll.add(vid);
            if (slug) (uniqBySlug[slug] || (uniqBySlug[slug] = new Set())).add(vid);
          }
          const ref = (item.ref && item.ref.S) || "";
          if (ref) {
            refCounts[ref] = (refCounts[ref] || 0) + 1;
            if (slug) (refBySlug[slug] || (refBySlug[slug] = {}))[ref] =
              ((refBySlug[slug] || {})[ref] || 0) + 1;
          }
          const day = localDay(ca);
          if (day) {
            viewsDayTotal[day] = (viewsDayTotal[day] || 0) + 1;
            if (vid) (uniqDayTotal[day] || (uniqDayTotal[day] = new Set())).add(vid);
            if (slug) (viewsDayBySlug[slug] || (viewsDayBySlug[slug] = {}))[day] =
              ((viewsDayBySlug[slug] || {})[day] || 0) + 1;
          }
        } else if (kind === "builder_open") {
          builderOpens++;
        } else if (kind === "cat") {
          if (slug) catCounts[slug] = (catCounts[slug] || 0) + 1;
        } else if (kind === "editor") {
          if (slug) editorSlugs.add(slug);
        } else if (kind.indexOf("start_") === 0) {
          const m = kind.slice(6);
          if (m in startMethods) startMethods[m]++;
        } else if (kind.indexOf("feat_") === 0) {
          const f = kind.slice(5);
          (featSlugs[f] || (featSlugs[f] = new Set())).add(slug || "?" + Math.random());
          if (slug) (featsBySlug[slug] || (featsBySlug[slug] = new Set())).add(f);
        }
      }
      startKey = res.LastEvaluatedKey;
    } while (startKey);

    const topGuides = Object.keys(viewsBySlug)
      .map((slug) => ({ slug, views: viewsBySlug[slug] }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    const features: Record<string, number> = {};
    for (const f of Object.keys(featSlugs)) features[f] = featSlugs[f].size;

    // Per-guide breakdown: every slug we've seen any event for, with its own
    // views / shares / publishes / features / last activity. Sorted by views.
    const slugSet = new Set<string>([
      ...Object.keys(viewsBySlug), ...Object.keys(sharesBySlug),
      ...Object.keys(publishesBySlug), ...Object.keys(featsBySlug),
    ]);
    const guides = Array.from(slugSet)
      .map((slug) => ({
        slug,
        views: viewsBySlug[slug] || 0,
        shares: sharesBySlug[slug] || 0,
        publishes: publishesBySlug[slug] || 0,
        unique: uniqBySlug[slug] ? uniqBySlug[slug].size : 0,
        created: createdBySlug[slug] || firstSeenBySlug[slug] || "",
        features: featsBySlug[slug] ? Array.from(featsBySlug[slug]) : [],
        lastActive: lastBySlug[slug] || "",
        // 30-day daily views (zero-filled), only for guides that have any.
        daily: viewsDayBySlug[slug]
          ? dayAxis.map((d) => ({ d, v: viewsDayBySlug[slug][d] || 0 }))
          : undefined,
        // Top traffic sources for this guide, e.g. { "reddit.com": 12, direct: 3 }.
        refs: refBySlug[slug]
          ? Object.fromEntries(Object.entries(refBySlug[slug])
              .sort((a, b) => b[1] - a[1]).slice(0, 5))
          : undefined,
      }))
      .sort((a, b) => b.views - a.views || b.shares - a.shares || b.publishes - a.publishes)
      .slice(0, 100);

    const viewsDaily = dayAxis.map((d) => ({
      d, v: viewsDayTotal[d] || 0, u: uniqDayTotal[d] ? uniqDayTotal[d].size : 0,
    }));
    const uniqueVisitors = uniqAll.size;
    const funnel = {
      opens: builderOpens,
      starts: startMethods.talk + startMethods.paste + startMethods.scratch + startMethods.photo,
      drafts: editorSlugs.size,
      published: Object.keys(publishesBySlug).length,
    };

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ publishes, views, uniqueVisitors, shares, topGuides, startMethods, features, guides, viewsDaily, funnel, cats: catCounts, refs: refCounts }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
