import type { Schema } from "../../data/resource";

const MODEL = "claude-opus-4-8";

/**
 * Two modes:
 *  - "polish": rewrite text clearly/warmly. Returns { text }.
 *  - "import": turn a blob of existing notes into a structured guide.
 *              Returns { title, sections:[{emoji,title,body}], contacts:[{label,value}] }.
 */
export const handler: Schema["aiAssist"]["functionHandler"] = async (event) => {
  const mode = event.arguments.mode;
  const text = (event.arguments.text || "").slice(0, 8000);
  const category = event.arguments.category || "general";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI is not configured");

  let system: string;
  if (mode === "import") {
    system =
      "You turn a person's existing free-form notes into a structured How2 guide. " +
      "Return ONLY a JSON object of this exact shape: " +
      '{"title": string, "sections": [{"emoji": string, "title": string, "body": string}], "contacts": [{"label": string, "value": string}]}. ' +
      "Give each section a short title and a fitting emoji. Group related details together. " +
      "Put vets, doctors, phone numbers and emergency people into contacts (label + value). " +
      "Keep the person's own wording, lightly tidied for clarity. Do not invent details. " +
      'This guide is about: "' + category + '".';
  } else {
    system =
      "You are an editor for How2. Rewrite the user's text so it reads clearly, warmly and " +
      "professionally, keeping every specific detail (names, numbers, times, doses). Keep it " +
      "concise. Return only the rewritten text, with no preamble and no surrounding quotes.";
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
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: text }],
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
  return { text: out };
};
