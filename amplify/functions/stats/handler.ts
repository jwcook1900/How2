import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { canonicalRef } from "../shared/canonicalRef";

const ddb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});

// Account counts straight from the user pool (full history — Cognito stamps
// every user's creation date, so this is exact from day one, not from when
// tracking shipped). Also buckets signups into the caller's local days for the
// "new accounts" timeline. Best-effort: on any failure the page omits it.
async function countAccounts(
  tz: number,
  dayAxis: string[],
  fromMs: number, // NaN when no window
  winEnd: number,
): Promise<{ total: number; week: number; daily: { d: string; v: number }[]; windowed: number | null } | null> {
  const poolId = process.env.USER_POOL_ID;
  if (!poolId) return null;
  try {
    let total = 0, week = 0, windowed = 0;
    const hasWin = !isNaN(fromMs);
    const weekAgo = Date.now() - 7 * 86400000;
    const byDay: Record<string, number> = {};
    const localDay = (t: number) => new Date(t - tz * 60000).toISOString().slice(0, 10);
    let token: string | undefined = undefined;
    do {
      const res: any = await cognito.send(new ListUsersCommand({
        UserPoolId: poolId, Limit: 60, PaginationToken: token,
      }));
      for (const u of res.Users || []) {
        total++;
        const created = u.UserCreateDate ? new Date(u.UserCreateDate).getTime() : 0;
        if (created > weekAgo) week++;
        if (hasWin && created >= fromMs && created < winEnd) windowed++;
        if (created) { const d = localDay(created); byDay[d] = (byDay[d] || 0) + 1; }
      }
      token = res.PaginationToken;
    } while (token);
    // Same zero-filled axis as the views chart, so charts line up.
    const daily = dayAxis.map((d) => ({ d, v: byDay[d] || 0 }));
    return { total, week, daily, windowed: hasWin ? windowed : null };
  } catch (e) {
    return null;
  }
}
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
    let key = "", tz = 0, fromStr = "", toStr = "", sinceMs = NaN;
    try {
      const b = JSON.parse(raw || "{}");
      key = (b.key || "").trim();
      tz = Math.max(-840, Math.min(840, Number(b.tz) || 0)); // caller's Date.getTimezoneOffset()
      // Optional date window (local YYYY-MM-DD, inclusive): when set, every
      // aggregate in the response answers for the window instead of all time.
      if (/^\d{4}-\d{2}-\d{2}$/.test(b.from || "")) fromStr = b.from;
      if (/^\d{4}-\d{2}-\d{2}$/.test(b.to || "")) toStr = b.to;
      // "Since I marked this moment": a precise epoch-ms start, so the whole
      // dashboard can read from the minute a campaign went out rather than
      // from the start of that day. Overrides from/to when present.
      const st = Number(b.sinceTs);
      if (isFinite(st) && st > 0) sinceMs = Math.min(st, Date.now());
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
    const dayMs = 86400000;
    const localDay = (iso: string) => {
      const t = Date.parse(iso);
      return isNaN(t) ? "" : new Date(t - tz * 60000).toISOString().slice(0, 10);
    };
    // Resolve the optional window into UTC-ms bounds on local-day edges.
    // Missing/one-sided input degrades sensibly; ranges are capped at 120
    // days so the axis (one bar per day) stays renderable.
    const localMidnight = (d: string) => Date.parse(d + "T00:00:00Z") + tz * 60000;
    // A "since" mark spans its own day through today; the exact instant is
    // kept separately so filtering is minute-accurate while the chart axis
    // stays on whole local days.
    if (!isNaN(sinceMs)) {
      fromStr = localDay(new Date(sinceMs).toISOString());
      toStr = localDay(new Date().toISOString());
    }
    let fromMs = fromStr ? localMidnight(fromStr) : NaN;
    let toMs = toStr ? localMidnight(toStr) : NaN;
    if (!isNaN(fromMs) && isNaN(toMs)) toMs = localMidnight(localDay(new Date().toISOString()));
    if (isNaN(fromMs) && !isNaN(toMs)) fromMs = toMs;
    if (!isNaN(fromMs) && !isNaN(toMs) && fromMs > toMs) { const t = fromMs; fromMs = toMs; toMs = t; }
    const hasWin = !isNaN(fromMs) && !isNaN(toMs);
    if (hasWin && (toMs - fromMs) / dayMs >= 120) fromMs = toMs - 119 * dayMs;
    const winEnd = toMs + dayMs; // exclusive
    // Events are filtered from the exact mark when there is one, from the
    // window's first midnight otherwise.
    const filterFrom = !isNaN(sinceMs) && sinceMs > fromMs ? sinceMs : fromMs;
    const inWin = (ca: string) => {
      if (!hasWin) return true;
      const t = Date.parse(ca);
      return !isNaN(t) && t >= filterFrom && t < winEnd;
    };
    // Chart axis: the window's days when one is set, else the last 30 days.
    const dayAxis: string[] = [];
    if (hasWin) {
      for (let t = fromMs; t < winEnd; t += dayMs) {
        dayAxis.push(new Date(t - tz * 60000).toISOString().slice(0, 10));
      }
    } else {
      for (let i = DAYS - 1; i >= 0; i--) {
        dayAxis.push(new Date(Date.now() - tz * 60000 - i * 86400000).toISOString().slice(0, 10));
      }
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
    // Deduped steps count in the window their FIRST event landed in, tracked
    // all-time in firstEditorBySlug / firstTapByKey / createdBySlug below.
    let builderOpens = 0;
    const catCounts: Record<string, number> = {};
    let publishErrors = 0;
    // Daily funnel buckets so campaign waves can be compared by date window.
    // Raw steps (opens, starts) count per event day; deduped steps (drafts,
    // tried, published) count on the day of that slug's FIRST such event.
    const opensByDay: Record<string, number> = {};
    const startsByDay: Record<string, number> = {};
    const firstEditorBySlug: Record<string, string> = {};
    const firstTapByKey: Record<string, string> = {};
    // The live "lights up as you answer" flow announces itself with live_open;
    // the classic wizard never does, so this is the flow-version split.
    let liveOpens = 0;
    const liveByDay: Record<string, number> = {};
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
        // Identity trackers are window-independent: created/last-active dates
        // and each slug's FIRST draft/tap/publish moment (windowed funnel
        // steps count a guide in the window its first such event landed in).
        if (slug && ca && ca > (lastBySlug[slug] || "")) lastBySlug[slug] = ca;
        if (slug && ca && (!firstSeenBySlug[slug] || ca < firstSeenBySlug[slug])) firstSeenBySlug[slug] = ca;
        if (kind === "publish" && slug && ca && (!createdBySlug[slug] || ca < createdBySlug[slug])) createdBySlug[slug] = ca;
        if (kind === "editor" && slug && ca && (!firstEditorBySlug[slug] || ca < firstEditorBySlug[slug])) firstEditorBySlug[slug] = ca;
        if (kind === "publish_tap") {
          const tapKey = slug || "?" + Math.random();
          if (ca && (!firstTapByKey[tapKey] || ca < firstTapByKey[tapKey])) firstTapByKey[tapKey] = ca;
        }
        // Everything from here answers for the window (all time when none set).
        if (!inWin(ca)) continue;
        if (kind === "publish") {
          publishes++;
          if (slug) publishesBySlug[slug] = (publishesBySlug[slug] || 0) + 1;
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
          const ref = canonicalRef((item.ref && item.ref.S) || "");
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
          const d = localDay(ca);
          if (d) opensByDay[d] = (opensByDay[d] || 0) + 1;
        } else if (kind === "cat") {
          if (slug) catCounts[slug] = (catCounts[slug] || 0) + 1;
        } else if (kind === "publish_err") {
          publishErrors++;
        } else if (kind === "live_open") {
          liveOpens++;
          const d = localDay(ca);
          if (d) liveByDay[d] = (liveByDay[d] || 0) + 1;
        } else if (kind.indexOf("start_") === 0) {
          const m = kind.slice(6);
          if (m in startMethods) startMethods[m]++;
          const d = localDay(ca);
          if (d) startsByDay[d] = (startsByDay[d] || 0) + 1;
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

    // First-event-in-window funnel steps (all-time when no window is set).
    const draftSlugsWin = Object.keys(firstEditorBySlug).filter((s) => inWin(firstEditorBySlug[s]));
    const triedKeysWin = Object.keys(firstTapByKey).filter((k) => inWin(firstTapByKey[k]));
    const publishedSlugsWin = Object.keys(createdBySlug).filter((s) => inWin(createdBySlug[s]));

    // Per-guide breakdown: every slug with any activity in the window (plus
    // guides first published in it, so a wave's new guides appear even with
    // zero views yet). Sorted by views.
    const slugSet = new Set<string>([
      ...Object.keys(viewsBySlug), ...Object.keys(sharesBySlug),
      ...Object.keys(publishesBySlug), ...Object.keys(featsBySlug),
      ...publishedSlugsWin,
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
      drafts: draftSlugsWin.length,
      tried: triedKeysWin.length,
      published: publishedSlugsWin.length,
      errors: publishErrors,
      live: liveOpens,
    };

    // Same zero-filled axis as the views chart, so the range chips can
    // slice both. Deduped steps land on the slug's first-event day.
    const draftsByDay: Record<string, number> = {};
    for (const slug of draftSlugsWin) {
      const d = localDay(firstEditorBySlug[slug]);
      if (d) draftsByDay[d] = (draftsByDay[d] || 0) + 1;
    }
    const triedByDay: Record<string, number> = {};
    for (const key of triedKeysWin) {
      const d = localDay(firstTapByKey[key]);
      if (d) triedByDay[d] = (triedByDay[d] || 0) + 1;
    }
    const publishedByDay: Record<string, number> = {};
    for (const slug of publishedSlugsWin) {
      const d = localDay(createdBySlug[slug]);
      if (d) publishedByDay[d] = (publishedByDay[d] || 0) + 1;
    }
    const funnelDaily = dayAxis.map((d) => ({
      d,
      o: opensByDay[d] || 0,
      s: startsByDay[d] || 0,
      dr: draftsByDay[d] || 0,
      t: triedByDay[d] || 0,
      p: publishedByDay[d] || 0,
      l: liveByDay[d] || 0,
    }));

    const accounts = await countAccounts(tz, dayAxis, hasWin ? filterFrom : NaN, winEnd);

    // Echo the effective window (post-clamp) so the page can label itself.
    const window = hasWin
      ? {
          from: dayAxis[0],
          to: dayAxis[dayAxis.length - 1],
          // Present only for a "since I marked this" window, so the page can
          // label it with the moment rather than the day.
          since: !isNaN(sinceMs) ? new Date(sinceMs).toISOString() : null,
        }
      : null;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ publishes, views, uniqueVisitors, shares, topGuides, startMethods, features, guides, viewsDaily, funnel, funnelDaily, cats: catCounts, refs: refCounts, accounts, window }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
