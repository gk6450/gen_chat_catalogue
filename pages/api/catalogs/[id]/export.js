import { query } from "../../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    // Fetch catalogue
    const catRes = await query(
      "SELECT id, title, description, created_at FROM catalogs WHERE id = $1",
      [id]
    );
    if (catRes.rowCount === 0) return res.status(404).json({ error: "Not found" });
    const catalog = catRes.rows[0];

    // Fetch items
    const itemsRes = await query(
      "SELECT id, category, name, description, price, tags, extra FROM items WHERE catalog_id = $1 ORDER BY id",
      [id]
    );
    const items = itemsRes.rows;

    // Group items into categories
    const categoriesMap = {};
    for (const it of items) {
      const catName = it.category || "General";
      if (!categoriesMap[catName]) categoriesMap[catName] = [];
      categoriesMap[catName].push(it);
    }
    const categories = Object.entries(categoriesMap).map(([name, items]) => ({ name, items }));

    const out = {
      id: catalog.id,
      title: catalog.title,
      description: catalog.description,
      created_at: catalog.created_at,
      categories
    };

    const fmt = (req.query.format || "json").toString().toLowerCase();
    const slug = (catalog.title || "catalog").toString().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `catalog-${catalog.id}`;
    const filenameBase = `${slug}-${catalog.id}`;

    // Helper: CSV escaping
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const s = typeof val === "string" ? val : JSON.stringify(val);
      if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    if (fmt === "json") {
      const jsonText = JSON.stringify(out, null, 2);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.json"`);
      return res.status(200).send(jsonText);
    }

    if (fmt === "csv") {
      // header
      const rows = [
        ["category", "name", "description", "price", "tags", "extra"]
      ];
      for (const cat of out.categories) {
        for (const it of cat.items) {
          // tags: ensure string
          const tags = Array.isArray(it.tags) ? it.tags.join(", ") : (it.tags ?? "");
          // extra: stringify if object
          const extra = (it.extra && typeof it.extra === "object") ? JSON.stringify(it.extra) : (it.extra ?? "");
          const price = (it.price !== null && it.price !== undefined && it.price !== "") ? String(it.price) : "";
          rows.push([cat.name, it.name, it.description ?? "", price, tags, extra]);
        }
      }
      const csv = rows.map(r => r.map(escapeCsv).join(",")).join("\r\n");
      // Optional: prepend BOM for Excel to recognize UTF-8
      const bom = "\uFEFF";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
      return res.status(200).send(bom + csv);
    }

    if (fmt === "md" || fmt === "markdown") {
      let md = `# ${catalog.title || "Catalogue"}\n\n`;
      if (catalog.description) md += `${catalog.description}\n\n`;
      md += `*Exported: ${new Date(catalog.created_at).toLocaleString()}*\n\n`;
      for (const cat of out.categories) {
        md += `## ${cat.name}\n\n`;
        for (const it of cat.items) {
          md += `- **${it.name}**`;
          if (it.price) md += ` — ₹${it.price}`;
          md += `\n`;
          if (it.description) md += `  \n  ${it.description}\n`;
          if (it.tags && Array.isArray(it.tags) && it.tags.length) md += `  \n  Tags: ${it.tags.join(", ")}\n`;
          if (it.extra && typeof it.extra === "object") md += `  \n  Extra: ${JSON.stringify(it.extra)}\n`;
          md += `\n`;
        }
      }
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.md"`);
      return res.status(200).send(md);
    }

    return res.status(400).json({ error: `Unsupported format '${fmt}'. Supported: json, csv, md` });
  } catch (err) {
    console.error("export error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
