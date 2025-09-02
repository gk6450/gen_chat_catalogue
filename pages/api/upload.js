import formidable from "formidable";
import fs from "fs/promises";
import os from "os";
import { query } from "../../lib/db.js";
import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: false
  }
};

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD ?? "0.75");


// Form parsing helper
const parseForm = (req) => {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 10 * 1024 * 1024 // 10MB
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

// Helpers to normalize uploaded file object
function normalizeUploadedFile(files) {
  if (!files || Object.keys(files).length === 0) return undefined;

  let fileEntry = files.file ?? files.chat ?? undefined;

  if (!fileEntry) {
    const vals = Object.values(files);
    if (vals.length > 0) fileEntry = vals[0];
  }

  if (Array.isArray(fileEntry)) fileEntry = fileEntry[0];
  if (!fileEntry) return undefined;

  const candidates = [
    fileEntry.filepath,
    fileEntry.filePath,
    fileEntry.path,
    fileEntry.file?.filepath,
    fileEntry.file?.path,
    fileEntry.tempFilePath,
    fileEntry.tempFilepath,
    fileEntry.tempfile,
    fileEntry.file?.tempfile
  ];

  const found = candidates.find((c) => typeof c === "string" && c.length > 0);

  if (!found) {
    for (const val of Object.values(fileEntry)) {
      if (typeof val === "string" && (val.startsWith("/") || val.includes(os.tmpdir()))) {
        return { filepath: val, originalFilename: fileEntry.originalFilename ?? fileEntry.name ?? null };
      }
    }
    return undefined;
  }

  return { filepath: found, originalFilename: fileEntry.originalFilename ?? fileEntry.name ?? null };
}

// Gemini client init
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY not set — model calls will fail until you set it.");
}
const ai = new GoogleGenAI({ apiKey: geminiApiKey });


// Gemini call
async function callGemini_extractCatalogue_withConfidence(fileText, threshold) {
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

  const combinedUserText = `${systemInstruction}\n\nPlease produce the JSON described above for the transcript.`;

  try {
      const request = {
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: combinedUserText }] }],
        temperature: 0.0
      };
      const resp = await ai.models.generateContent(request);
      if (typeof resp?.text === "string" && resp.text.length > 0) return resp.text;
      if (resp?.output?.[0]?.content?.[0]?.text) return resp.output[0].content[0].text;
      if (resp?.candidates?.[0]?.content?.[0]?.text) return resp.candidates[0].content[0].text;
      return JSON.stringify(resp);
    }
   catch (err) {
    throw new Error(`LLM call failed: ${err.message || String(err)}`);
  }
}


// JSON parse & recovery helper
function tryParseJSONorRecover(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
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


// Manual validator
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizePrice(v) {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.-]+/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function validateModelResponse(parsed, threshold = CONFIDENCE_THRESHOLD) {
  const errors = [];
  if (!isObject(parsed)) {
    errors.push("Top-level response must be an object");
    return { ok: false, errors };
  }

  const { confidence } = parsed;
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    errors.push("Missing or invalid 'confidence' (must be a number between 0 and 1)");
    return { ok: false, errors };
  }

  const hasCatalog = parsed.catalog !== undefined;
  const hasNote = parsed.note !== undefined;

  if (!(hasCatalog ^ hasNote)) {
    errors.push("Response must contain exactly one of 'catalog' or 'note'");
    return { ok: false, errors };
  }

  if (hasNote) {
    if (typeof parsed.note !== "string") errors.push("'note' must be a string");
    return { ok: true, low_confidence: true, confidence, note: parsed.note, value: null, errors };
  }

  const catalog = parsed.catalog;
  if (!isObject(catalog)) {
    errors.push("'catalog' must be an object");
    return { ok: false, errors };
  }

  const title = catalog.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    errors.push("catalog.title must be a non-empty string");
  }

  if (catalog.description !== undefined && typeof catalog.description !== "string") {
    errors.push("catalog.description must be a string");
  }

  if (!Array.isArray(catalog.categories)) {
    errors.push("catalog.categories must be an array");
  } else {
    for (let ci = 0; ci < catalog.categories.length; ci++) {
      const cat = catalog.categories[ci];
      if (!isObject(cat)) {
        errors.push(`catalog.categories[${ci}] must be an object`);
        continue;
      }
      if (typeof cat.name !== "string" || cat.name.trim().length === 0) {
        errors.push(`catalog.categories[${ci}].name must be a non-empty string`);
      }
      if (!Array.isArray(cat.items)) {
        errors.push(`catalog.categories[${ci}].items must be an array`);
      } else {
        for (let ii = 0; ii < cat.items.length; ii++) {
          const item = cat.items[ii];
          if (!isObject(item)) {
            errors.push(`catalog.categories[${ci}].items[${ii}] must be an object`);
            continue;
          }
          if (typeof item.name !== "string" || item.name.trim().length === 0) {
            errors.push(`catalog.categories[${ci}].items[${ii}].name must be a non-empty string`);
          }
          if (item.description !== undefined && typeof item.description !== "string") {
            errors.push(`catalog.categories[${ci}].items[${ii}].description must be a string`);
          }

          if (item.price !== undefined && !(typeof item.price === "number" || typeof item.price === "string")) {
            errors.push(`catalog.categories[${ci}].items[${ii}].price must be a number or string`);
          }
          if (item.tags !== undefined) {
            if (!Array.isArray(item.tags) || item.tags.some(t => typeof t !== "string")) {
              errors.push(`catalog.categories[${ci}].items[${ii}].tags must be an array of strings`);
            }
          }
          if (item.extra !== undefined && !isObject(item.extra)) {
            errors.push(`catalog.categories[${ci}].items[${ii}].extra must be an object`);
          }
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // normalize prices & minimal normalization
  const normalized = {
    title: catalog.title.trim(),
    description: catalog.description ? catalog.description.trim() : undefined,
    categories: catalog.categories.map((cat) => ({
      name: cat.name.trim(),
      items: cat.items.map((it) => {
        const normalizedPrice = normalizePrice(it.price);
        return {
          name: String(it.name).trim(),
          description: it.description ? String(it.description).trim() : undefined,
          price: normalizedPrice !== undefined ? normalizedPrice : undefined,
          tags: Array.isArray(it.tags) ? it.tags.map(t => String(t).trim()) : [],
          extra: isObject(it.extra) ? it.extra : undefined
        };
      })
    }))
  };

  const isHigh = confidence >= threshold;

  return { ok: true, low_confidence: !isHigh, confidence, catalog: normalized, errors: [] };
}


// API handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
    const normalized = normalizeUploadedFile(files);
    if (!normalized || !normalized.filepath) {
      return res.status(400).json({ error: "No file uploaded or unable to determine temp file path. Make sure the upload field name is 'file' and that a .txt file is being uploaded." });
    }
    const filePath = normalized.filepath;

    const fileText = await fs.readFile(filePath, "utf8");

    const rawModelOutput = await callGemini_extractCatalogue_withConfidence(fileText, CONFIDENCE_THRESHOLD);

    let parsedRaw;
    try {
      parsedRaw = tryParseJSONorRecover(rawModelOutput);
    } catch (e) {
      // Save rawModelOutput in meta for debugging but return parse error
      return res.status(200).json({
        ok: false,
        reason: "parse_error",
        message: "Model output was not valid JSON",
        rawModelOutput
      });
    }

    // Validate top-level response shape (manual validator)
    const validation = validateModelResponse(parsedRaw, CONFIDENCE_THRESHOLD);
    if (!validation.ok) {
      return res.status(200).json({
        ok: false,
        reason: "invalid_schema",
        errors: validation.errors,
        rawModelOutput
      });
    }

    // If model explicitly returned a note (low confidence) — do not persist
    if (validation.low_confidence || !validation.catalog) {
      return res.status(200).json({
        ok: false,
        reason: "low_confidence",
        confidence: validation.confidence ?? parsedRaw.confidence,
        note: parsedRaw.note ?? "Model indicated low confidence and did not return a catalogue.",
        rawModelOutput
      });
    }

    const catalog = validation.catalog;

    // Persist catalog into DB
    const catalogInsert = await query(
      `INSERT INTO catalogs(title, description, source_text, meta) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [catalog.title, catalog.description || null, fileText, JSON.stringify({ rawModelOutput })]
    );
    const catalogId = catalogInsert.rows[0].id;

    // Persist items
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

    try {
      await fs.unlink(filePath).catch(() => {});
    } catch (_) {}

    return res.status(200).json({
      ok: true,
      catalogId,
      storedItemsCount: insertedItems.length,
      confidence: parsedRaw.confidence,
      parsedCatalogue: { title: catalog.title, description: catalog.description, categories: catalog.categories }
    });
  } catch (err) {
    console.error("upload handler error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
