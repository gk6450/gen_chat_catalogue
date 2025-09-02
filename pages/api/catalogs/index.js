import { query } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const q = `
      SELECT c.id, c.title, c.description, c.created_at, COUNT(i.id)::int AS item_count
      FROM catalogs c
      LEFT JOIN items i ON i.catalog_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 200
    `;
    const r = await query(q);
    return res.status(200).json({ catalogs: r.rows });
  } catch (err) {
    console.error("GET /api/catalogs error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
