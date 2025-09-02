// pages/api/upload.js
import formidable from "formidable";
import fs from "fs/promises";
import { query } from "../../lib/db.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const config = {
  api: {
    bodyParser: false
  }
};

/* -------------------------
   Config / Threshold
   ------------------------- */
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD ?? "0.75");

/* -------------------------
   Zod schemas for validation
   ------------------------- */
const ItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.union([z.number().nonnegative(), z.string()]).optional(),
  tags: z.array(z.string()).optional(),
  extra: z.record(z.any()).optional()
});

const CategorySchema = z.object({
  name: z.string().min(1),
  items: z.array(ItemSchema)
});

const CatalogSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categories: z.array(CategorySchema)
});

/**
 * Response shape the model should return:
 * {
 *   "confidence": 0.87,
 *   "catalog": { ... }   // OR
 *   "note": "Unable to build catalogue because ..."
 * }
 */
const ResponseSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    catalog: CatalogSchema.optional(),
    note: z.string().optional()
  })
  .refine(
    (obj) => Boolean(obj.catalog) !== Boolean(obj.note),
    { message: "Either 'catalog' or 'note' must be present (not both)" }
  );

/* -------------------------
   Form parsing helper
   ------------------------- */
const parseForm = (req) => {
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

/* -------------------------
   Gemini client init
   ------------------------- */
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY not set — model calls will fail until you set it.");
}
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

/* -------------------------
   Gemini call (returns raw text)
   ------------------------- */
async function callGemini_extractCatalogue_withConfidence(fileText, threshold) {
  // The system prompt instructs the model to always return strict JSON with confidence.
  const systemInstruction = `
You are an assistant that extracts a structured product/service catalogue from a plain-text group chat transcript.
Return ONLY valid JSON (no surrounding explanation). The JSON MUST be a top-level object with:
- "confidence": a number between 0 and 1, representing how confident you are in the catalogue extraction.
- EITHER "catalog": the catalogue object (see schema below) if confidence >= ${threshold}
  OR "note": a short explanation (string) why you could not reliably extract a catalogue (if confidence < ${threshold}).

The catalogue object (if present) must follow this schema:

{
  "title": "<short title for catalogue>",
  "description": "<one-sentence description>",
  "categories": [
    {
      "name": "<category name>",
      "items": [
        {
          "name": "<item name>",
          "description": "<optional longer description>",
          "price": <optional number>,
          "tags": ["optional","tags"],
          "extra": { "any_other_extracted_fields": ... }
        }
      ]
    }
  ]
}

Rules:
- If price not mentioned, omit price (do not put null).
- Normalize prices to numbers (strip currency symbols).
- If unsure about categories, use "General".
- Extract duplicates once only.
- Provide a short catalogue title (3-6 words).
- Keep values short and consistent.
- Use arrays even if a single item exists.
- The output must be strict JSON. NO commentary or markdown.

Now parse the following chat transcript and produce the required JSON.

Chat transcript START:
${fileText}
Chat transcript END:
`.trim();

  const request = {
    model: "gemini-2.5-flash", // change if needed per your account
    contents: [
      { role: "system", parts: [{ text: systemInstruction }] },
      { role: "user", parts: [{ text: "Please produce the JSON described above for the transcript." }] }
    ],
    temperature: 0.0
  };

  const resp = await ai.models.generateContent(request);

  // tolerant extraction of produced text (SDK response shapes vary)
  let contentText;
  if (resp?.text) contentText = resp.text;
  else if (resp?.output?.[0]?.content?.[0]?.text) contentText = resp.output[0].content[0].text;
  else if (resp?.candidates?.[0]?.content?.[0]?.text) contentText = resp.candidates[0].content[0].text;
  else contentText = JSON.stringify(resp);

  return contentText;
}

/* -------------------------
   JSON parse & recovery helper
   ------------------------- */
function tryParseJSONorRecover(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Extract substring between first '{' and last '}' and parse
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try {
        const sub = text.slice(start, end + 1);
        return JSON.parse(sub);
      } catch (e2) {
        throw new Error("Failed to parse JSON from model output");
      }
    }
    throw new Error("Failed to parse JSON from model output");
  }
}

/* -------------------------
   API handler
   ------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
    const uploaded = files?.file || files?.chat;
    if (!uploaded) return res.status(400).json({ error: "No file uploaded (field name: file)" });

    const fileText = await fs.readFile(uploaded.filepath, "utf8");

    // 1. Call Gemini and get raw model output
    const rawModelOutput = await callGemini_extractCatalogue_withConfidence(fileText, CONFIDENCE_THRESHOLD);

    // 2. Parse JSON (with recovery)
    const parsedRaw = tryParseJSONorRecover(rawModelOutput);

    // 3. Validate top-level response shape
    const validatedResp = ResponseSchema.parse(parsedRaw);

    // 4. Decide whether to persist or return low-confidence
    const { confidence, catalog, note } = validatedResp;

    if (!catalog || confidence < CONFIDENCE_THRESHOLD) {
      // Low confidence: do NOT persist. Return a helpful message to client with model note.
      return res.status(200).json({
        ok: false,
        reason: "low_confidence",
        confidence,
        note: note ?? "Model indicated low confidence and did not return a catalogue.",
        rawModelOutput
      });
    }

    // 5. Persist catalog into DB
    const catalogInsert = await query(
      `INSERT INTO catalogs(title, description, source_text, meta) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [catalog.title, catalog.description || null, fileText, JSON.stringify({ rawModelOutput })]
    );
    const catalogId = catalogInsert.rows[0].id;

    const insertedItems = [];
    for (const category of catalog.categories) {
      const catName = category.name;
      const seen = new Set();
      for (const item of category.items) {
        if (seen.has(item.name)) continue;
        seen.add(item.name);

        const price = (item.price !== undefined && item.price !== null && item.price !== "")
          ? (typeof item.price === "string" ? parseFloat(item.price.replace(/[^0-9.]/g, "")) : item.price)
          : null;

        const tags = item.tags && item.tags.length ? item.tags : null;
        const extra = item.extra || null;

        const r = await query(
          `INSERT INTO items(catalog_id, category, name, description, price, tags, extra) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [catalogId, catName, item.name, item.description || null, price, tags, extra ? JSON.stringify(extra) : null]
        );
        insertedItems.push({ id: r.rows[0].id, name: item.name, category: catName });
      }
    }

    // 6. Return saved info to client
    return res.status(200).json({
      ok: true,
      catalogId,
      storedItemsCount: insertedItems.length,
      confidence,
      parsedCatalogue: catalog
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
