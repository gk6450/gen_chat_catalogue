import { query } from "../../../lib/db.js";

export default async function handler(req, res) {
  const { id } = req.query;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    const catRes = await query("SELECT id, title, description, source_text, meta, created_at FROM catalogs WHERE id = $1", [id]);
    if (catRes.rowCount === 0) return res.status(404).json({ error: "Not found" });
    const catalog = catRes.rows[0];

    const itemsRes = await query("SELECT id, category, name, description, price, tags, extra, created_at FROM items WHERE catalog_id = $1 ORDER BY id", [id]);
    const items = itemsRes.rows;

    const categories = {};
    for (const it of items) {
      const cat = it.category || "General";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(it);
    }
    const categoriesArr = Object.entries(categories).map(([name, items]) => ({ name, items }));

    return res.status(200).json({ catalog: { ...catalog, categories: categoriesArr }, itemsCount: items.length });
  } catch (err) {
    console.error("GET /api/catalogs/[id] error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
