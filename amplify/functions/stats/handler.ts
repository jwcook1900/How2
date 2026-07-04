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
    let key = "";
    try { key = (JSON.parse(raw || "{}").key || "").trim(); } catch (e) { key = ""; }

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
    // How guides are started (totals) and which features they use (distinct
    // guides — a Set of slugs per feature, so re-publishes don't double-count).
    const startMethods: Record<string, number> = { talk: 0, paste: 0, scratch: 0 };
    const featSlugs: Record<string, Set<string>> = {};
    let startKey: Record<string, any> | undefined = undefined;
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: table,
        ProjectionExpression: "#k, slug, createdAt",
        ExpressionAttributeNames: { "#k": "kind" },
        ExclusiveStartKey: startKey,
      }));
      for (const item of res.Items || []) {
        const kind = (item.kind && item.kind.S) || "";
        const slug = (item.slug && item.slug.S) || "";
        const ca = (item.createdAt && item.createdAt.S) || "";
        if (slug && ca && ca > (lastBySlug[slug] || "")) lastBySlug[slug] = ca;
        if (kind === "publish") {
          publishes++;
          if (slug) publishesBySlug[slug] = (publishesBySlug[slug] || 0) + 1;
        } else if (kind === "share") {
          shares++;
          if (slug) sharesBySlug[slug] = (sharesBySlug[slug] || 0) + 1;
        } else if (kind === "view") {
          views++;
          if (slug) viewsBySlug[slug] = (viewsBySlug[slug] || 0) + 1;
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
        features: featsBySlug[slug] ? Array.from(featsBySlug[slug]) : [],
        lastActive: lastBySlug[slug] || "",
      }))
      .sort((a, b) => b.views - a.views || b.shares - a.shares || b.publishes - a.publishes)
      .slice(0, 100);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ publishes, views, shares, topGuides, startMethods, features, guides }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
