import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function CatalogDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/catalogs/${id}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        if (mounted) setData(j);
      } catch (e) {
        setErr(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">{data?.catalog?.title ?? "Catalogue detail"}</h1>
          <p className="tagline">{data?.catalog?.description}</p>
        </div>
        <div className="nav-actions">
          <Link href="/catalogs" legacyBehavior>
            <a className="link-btn">Back to list</a>
          </Link>
          <Link href="/" legacyBehavior>
            <a className="link-btn">Upload</a>
          </Link>
          {id && (
            <a href={`/api/catalogs/${id}/download`} className="link-btn primary" style={{ marginLeft: 6 }}>
              Download Chat
            </a>
          )}
        </div>
      </header>

      <section>
        {loading ? (
          <div className="small">Loading…</div>
        ) : err ? (
          <div className="warn">{err}</div>
        ) : !data?.catalog ? (
          <div className="small">Not found.</div>
        ) : (
          <article className="catalog-card animate-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <h2 style={{ marginTop: 0 }}>{data.catalog.title}</h2>
                <div className="small">{new Date(data.catalog.created_at).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small">Items</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{data.itemsCount}</div>
              </div>
            </div>

            {/* categories */}
            {data.catalog.categories.map((cat, idx) => (
              <section className="category" key={idx}>
                <h4>{cat.name}</h4>
                {cat.items.map((it) => (
                  <div key={it.id} className="item">
                    <div className="left">
                      <div className="avatar">{(it.name || "").split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        {it.description && <div className="meta" style={{ marginTop: 6 }}>{it.description}</div>}
                      </div>
                    </div>
                    <div className="price">{it.price ? `₹${it.price}` : "—"}</div>
                  </div>
                ))}
              </section>
            ))}
          </article>
        )}
      </section>
    </div>
  );
}
