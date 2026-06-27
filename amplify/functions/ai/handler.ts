import type { Schema } from "../../data/resource";

const MODEL = "claude-opus-4-8";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

/**
 * Modes:
 *  - "polish": rewrite one field's text clearly/warmly, using the guide
 *              category + the question being answered as context. Returns { text }.
 *  - "field":  read an attached photo/PDF and write the content for one field
 *              (the question being answered). Returns { text }.
 *  - "import": turn a blob of notes and/or an uploaded file (image or PDF)
 *              into a structured guide. Returns
 *              { title, sections:[{emoji,title,body}], contacts:[{label,value}] }.
 */
/**
 * Per-guide-type section ordering for the "import" flow. When the pasted notes
 * cover these topics, the AI groups and orders sections to match — so a pet or
 * babysitter guide comes out structured the way a carer expects to read it.
 * Returns "" for types without a preferred order.
 */
function importPriorities(category: string): string {
  const c = (category || "").toLowerCase();
  let order: string[] | null = null;
  if (c.includes("pet")) {
    order = [
      "Feeding",
      "Medication",
      "Walks and exercise",
      "Vet and emergency contacts",
      "Behaviour and quirks",
      "House rules",
    ];
  } else if (c.includes("baby") || c.includes("kid")) {
    order = [
      "Meals and snacks",
      "Nap and bedtime routine",
      "Allergies and medication",
      "Screen time rules",
      "Emergency contacts",
      "Comfort items",
      "House rules",
    ];
  }
  if (!order) return "";
  return (
    "When the notes cover them, prefer these sections, in this order: " +
    order.join("; ") +
    ". Only include the ones the notes actually support, and add any other " +
    "useful sections the notes contain. "
  );
}

export const handler: Schema["aiAssist"]["functionHandler"] = async (event) => {
  const mode = event.arguments.mode;
  const text = (event.arguments.text || "").slice(0, 8000);
  const category = event.arguments.category || "general";
  const question = event.arguments.question || "";
  const fileData = event.arguments.fileData || "";
  const fileType = event.arguments.fileType || "";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI is not configured");

  let system: string;
  let maxTokens = 1024;
  let userContent: string | Block[];

  if (mode === "import") {
    maxTokens = 2048;
    system =
      "You turn a person's existing notes (and any attached file) into a structured GotIt Guides guide. " +
      "Return ONLY a JSON object of this exact shape: " +
      '{"title": string, "sections": [{"emoji": string, "title": string, "body": string}], "contacts": [{"label": string, "value": string}]}. ' +
      "Give each section a short title and a fitting emoji. Group related details together. " +
      "Put vets, doctors, phone numbers and emergency people into contacts (label + value). " +
      "Keep the person's own wording, lightly tidied for clarity. Be concise. Do not invent details. " +
      "The notes may be rough or incomplete — that is fine. Only create sections the notes actually " +
      "support; never pad with empty or invented sections. " +
      importPriorities(category) +
      'This guide is about: "' + category + '".';

    const blocks: Block[] = [];
    if (fileData && fileType) {
      if (fileType === "application/pdf") {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } });
      } else if (fileType.indexOf("image/") === 0) {
        blocks.push({ type: "image", source: { type: "base64", media_type: fileType, data: fileData } });
      }
    }
    const instruction = blocks.length
      ? (text ? "My notes:\n" + text + "\n\n" : "") + "Build the guide from the attached file (and any notes above)."
      : text;
    blocks.push({ type: "text", text: instruction || "Build a starter guide." });
    userContent = blocks;
  } else if (mode === "field") {
    // Pull the content for ONE field out of an attached photo / PDF (+ optional notes).
    maxTokens = 1500;
    system =
      "You read an attached file (a photo, scan, or document) and write the content for ONE field of a " +
      "GotIt Guides guide. " +
      (question ? 'This field answers: "' + question + '". ' : "") +
      'The guide is about "' + category + '". ' +
      "Extract only the information relevant to this field. Transcribe real details exactly (names, numbers, " +
      "times, doses, addresses) and keep any list structure. Write it clearly and concisely. Do not invent " +
      "anything. If there is no relevant content, return an empty string. " +
      "Return only the field text — no preamble, headings, or quotes.";
    const blocks: Block[] = [];
    if (fileData && fileType) {
      if (fileType === "application/pdf") {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } });
      } else if (fileType.indexOf("image/") === 0) {
        blocks.push({ type: "image", source: { type: "base64", media_type: fileType, data: fileData } });
      }
    }
    blocks.push({
      type: "text",
      text: (text ? "Existing notes for this field:\n" + text + "\n\n" : "") +
        "Write this field's content from the attached file" + (text ? ", merged with the notes above." : "."),
    });
    userContent = blocks;
  } else {
    system =
      "You are an editor for GotIt Guides, a tool for friendly, shareable how-to guides. " +
      (question ? 'The text is the answer to: "' + question + '". ' : "") +
      'It belongs to a guide about "' + category + '". ' +
      "Rewrite the text so it reads clearly, warmly and professionally, keeping every specific " +
      "detail (names, numbers, times, doses, addresses) and any list structure. Keep it concise. " +
      "Do not add new information or headings. Return only the rewritten text, no preamble or quotes.";
    userContent = text;
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!resp.ok) {
    throw new Error("AI request failed (" + resp.status + ")");
  }

  const data: any = await resp.json();
  let out = "";
  for (const b of data.content || []) if (b.type === "text") out += b.text;
  out = out.trim();

  if (mode === "import") {
    const m = out.match(/\{[\s\S]*\}/);
    try {
      return JSON.parse(m ? m[0] : out);
    } catch (e) {
      return { title: "", sections: [{ emoji: "📝", title: "Notes", body: text }], contacts: [] };
    }
  }
  return { text: out.replace(/^["'“”]|["'“”]$/g, "").trim() };
};
