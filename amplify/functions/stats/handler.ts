import type { Schema } from "../../data/resource";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({});

/**
 * Returns { publishes, views, shares, topGuides:[{slug,views}] } from the Event
 * table. Requires the correct passphrase. Scans the (small) Event table — fine
 * for MVP volumes; would move to aggregate counters if it ever gets large.
 */
export const handler: Schema["getStats"]["functionHandler"] = async (event) => {
  const key = (event.arguments.key || "").trim();
  const secret = process.env.STATS_KEY || "";
  if (!secret) throw new Error("Stats are not configured");
  if (key !== secret) throw new Error("Wrong passphrase");

  const table = process.env.EVENT_TABLE;
  if (!table) throw new Error("Stats table is not set");

  let publishes = 0, views = 0, shares = 0;
  const viewsBySlug: Record<string, number> = {};
  let startKey: Record<string, any> | undefined = undefined;

  do {
    const res: any = await ddb.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: "#k, slug",
      ExpressionAttributeNames: { "#k": "kind" },
      ExclusiveStartKey: startKey,
    }));
    for (const item of res.Items || []) {
      const kind = item.kind && item.kind.S;
      const slug = (item.slug && item.slug.S) || "";
      if (kind === "publish") publishes++;
      else if (kind === "share") shares++;
      else if (kind === "view") {
        views++;
        if (slug) viewsBySlug[slug] = (viewsBySlug[slug] || 0) + 1;
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  const topGuides = Object.keys(viewsBySlug)
    .map((slug) => ({ slug, views: viewsBySlug[slug] }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return { publishes, views, shares, topGuides };
};
