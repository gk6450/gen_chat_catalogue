import { useEffect, useState } from "react";
import Link from "next/link";

export default function CatalogsPage() {
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/catalogs");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        if (mounted) setCatalogs(j.catalogs || []);
      } catch (e) {
        setErr(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Saved Catalogues</h1>
          <p className="tagline">All catalogues parsed and stored in the database.</p>
        </div>
        <div className="nav-actions">
          <Link href="/" legacyBehavior>
            <a className="link-btn">Upload new</a>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="small">Loading…</div>
      ) : err ? (
        <div className="warn">{err}</div>
      ) : catalogs.length === 0 ? (
        <div className="small">No catalogs saved yet.</div>
      ) : (
        <div className="catalog-grid">
          {catalogs.map((c) => (
            <div key={c.id} className="catalog-summary animate-in">
              <h3>{c.title}</h3>
              <div className="catalog-meta">{c.description}</div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="small">Items: <strong>{c.item_count}</strong></div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/catalogs/${c.id}`} legacyBehavior>
                    <a className="link-btn">View</a>
                  </Link>
                  {/* <a href={`/api/catalogs/${c.id}/download`} className="link-btn" download>
                    Export
                  </a> */}
                </div>
              </div>

              <div style={{ marginTop: 10 }} className="small">Saved: {new Date(c.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
