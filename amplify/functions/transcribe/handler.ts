const HEADERS = { "content-type": "application/json" };
const MAX_BYTES = 24 * 1024 * 1024; // Whisper's own limit is 25 MB

// Map the browser's recording mime type to a filename extension Whisper accepts
// (it sniffs the format partly from the name). Covers the formats MediaRecorder
// produces on Chrome/Android (webm/opus) and iOS Safari (mp4/m4a).
function extFor(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg") || m.includes("oga")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac") || m.includes("x-m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

export const handler = async (event: any) => {
  try {
    if (event?.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 204, headers: HEADERS, body: "" };
    }
    let raw = event && event.body;
    if (event && event.isBase64Encoded && raw) raw = Buffer.from(raw, "base64").toString("utf8");
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch (e) { body = {}; }

    const mime = String(body.mime || "audio/webm");
    const b64 = String(body.audio || "");
    if (!b64) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ ok: false, error: "No audio received." }) };

    const audio = Buffer.from(b64, "base64");
    if (!audio.length) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ ok: false, error: "That recording was empty." }) };
    if (audio.length > MAX_BYTES) return { statusCode: 413, headers: HEADERS, body: JSON.stringify({ ok: false, error: "That recording is too long — keep it under a couple of minutes." }) };

    const key = process.env.OPENAI_API_KEY;
    if (!key) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ ok: false, error: "Transcription isn't configured yet." }) };

    const form = new FormData();
    form.append("file", new Blob([audio], { type: mime }), "recording." + extFor(mime));
    form.append("model", "whisper-1");
    form.append("response_format", "json");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: "Bearer " + key },
        body: form,
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }

    if (!res.ok) {
      // Don't leak provider details to the client.
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ ok: false, error: "Couldn't transcribe that recording — please try again, or type your notes." }) };
    }
    const data: any = await res.json();
    const text = String((data && data.text) || "").trim();
    if (!text) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, error: "We couldn't make out any speech — try recording again somewhere quieter." }) };
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, text }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ ok: false, error: "Something went wrong transcribing that." }) };
  }
};
