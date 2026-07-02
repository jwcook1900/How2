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
    const viewsBySlug: Record<string, number> = {};
    // How guides are started (totals) and which features they use (distinct
    // guides — a Set of slugs per feature, so re-publishes don't double-count).
    const startMethods: Record<string, number> = { talk: 0, paste: 0, scratch: 0 };
    const featSlugs: Record<string, Set<string>> = {};
    let startKey: Record<string, any> | undefined = undefined;
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: table,
        ProjectionExpression: "#k, slug",
        ExpressionAttributeNames: { "#k": "kind" },
        ExclusiveStartKey: startKey,
      }));
      for (const item of res.Items || []) {
        const kind = (item.kind && item.kind.S) || "";
        const slug = (item.slug && item.slug.S) || "";
        if (kind === "publish") publishes++;
        else if (kind === "share") shares++;
        else if (kind === "view") {
          views++;
          if (slug) viewsBySlug[slug] = (viewsBySlug[slug] || 0) + 1;
        } else if (kind.indexOf("start_") === 0) {
          const m = kind.slice(6);
          if (m in startMethods) startMethods[m]++;
        } else if (kind.indexOf("feat_") === 0) {
          const f = kind.slice(5);
          (featSlugs[f] || (featSlugs[f] = new Set())).add(slug || "?" + Math.random());
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

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ publishes, views, shares, topGuides, startMethods, features }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "failed" }) };
  }
};
