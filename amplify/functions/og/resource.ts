import { defineFunction } from "@aws-amplify/backend";

/**
 * Share-preview proxy: serves /g/<slug> guide pages with per-guide Open Graph
 * metadata injected server-side, and /g/<slug>/card.png share-card images
 * drawn on demand (SVG → PNG via resvg-wasm). Exposed as a Lambda Function URL
 * that the Amplify Hosting /g/<*> rewrite proxies to — link crawlers don't run
 * JavaScript, so this is the only place previews can be personalised.
 */
export const ogFn = defineFunction({
  name: "og",
  entry: "./handler.ts",
  timeoutSeconds: 20,
  memoryMB: 1024, // PNG rasterisation; also makes cold starts brisk
  resourceGroupName: "data", // lives with the data stack (reads the Guide table)
});
