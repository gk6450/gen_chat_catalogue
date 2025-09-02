import { query } from "../../../../lib/db.js";

export default async function handler(req, res) {
  const { id } = req.query;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const r = await query("SELECT title, source_text FROM catalogs WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    const { title, source_text } = r.rows[0];
    const filename = `${(title || "catalog").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "catalog"}-${id}.txt`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(source_text || "");
  } catch (err) {
    console.error("download catalog error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
