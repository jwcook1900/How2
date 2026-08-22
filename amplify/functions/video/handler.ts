import type { Schema } from "../../data/resource";

/**
 * Returns a one-time Cloudflare Stream upload URL for the client to POST a
 * video file to. Shape: { uploadURL, uid } on success, or { error } if the
 * integration isn't configured or Cloudflare rejects the request.
 *
 * The returned `uid` is also the player id: the guide stores
 * https://iframe.videodelivery.net/<uid> as the section's embed URL.
 */
export const handler: Schema["videoUpload"]["functionHandler"] = async (event) => {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_TOKEN;
  if (!accountId || !token) {
    return { error: "Video upload isn't set up yet." };
  }

  // Clamp the allowed length so a runaway upload can't rack up cost.
  const requested = event.arguments.maxDurationSeconds || 150;
  const maxDurationSeconds = Math.min(Math.max(requested, 5), 300);

  let data: any;
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ maxDurationSeconds, requireSignedURLs: false }),
      }
    );
    data = await resp.json();
    if (!resp.ok || !data || !data.success || !data.result) {
      return { error: "Couldn't start the upload. Please try again." };
    }
  } catch (e) {
    return { error: "Couldn't reach the video service. Please try again." };
  }

  return { uploadURL: data.result.uploadURL, uid: data.result.uid };
};
