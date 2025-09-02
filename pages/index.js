// pages/index.js
import { useState, useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (response) {
      setAnimate(false);
      const t = setTimeout(() => setAnimate(true), 20);
      return () => clearTimeout(t);
    }
    setAnimate(false);
  }, [response]);

  const onFileChange = (e) => {
    setFile(e.target.files?.[0] ?? null);
    setResponse(null);
    setError(null);
  };

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!file) return alert("Please choose a .txt file first.");
    setLoading(true);
    setError(null);
    setResponse(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: form
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || JSON.stringify(j));
      setResponse(j);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const exportUrl = (id, format) => `/api/catalogs/${id}/export?format=${encodeURIComponent(format)}`;

  return (
    <div className="container">
      <header className="header">
        <div className="title-group">
          <div>
            <h1 className="title">Chat → Catalogue</h1>
            <p className="tagline">Turn group chat transcripts into a neat menu/catalogue.</p>
          </div>
        </div>

        <div className="nav-actions">
          <Link href="/catalogs" legacyBehavior>
            <a className="link-btn">View Catalogs</a>
          </Link>
        </div>
      </header>

      <section className="card" aria-labelledby="upload-heading">
        <div className="upload-left">
          <h3 id="upload-heading" style={{ margin: 0 }}>Upload transcript</h3>
          <p className="small" style={{ marginTop: 6 }}>Plain `.txt` (UTF-8). Keep one conversation per file for best extraction.</p>

          <div className="upload-cta" style={{ marginTop: 12 }}>
            <label className="file-input" aria-label="Choose chat file">
              {file ? file.name : "Choose file"}
              <input type="file" accept=".txt,text/plain" onChange={onFileChange} />
            </label>

            <button className="btn" onClick={handleSubmit} disabled={loading || !file}>
              {loading ? "Processing…" : "Upload & Process"}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <span className="small kv">Selected:</span>{" "}
            <strong>{file ? file.name : "No file"}</strong>
          </div>
        </div>

        <aside className="help" aria-hidden="false">
          <strong style={{ display: "block", marginBottom: 8 }}>Note</strong>
          <div className="small">Results are validated and saved only if confident. Use clear chats for best results.</div>
        </aside>
      </section>

      <section className="result">
        {error && (
          <div className="warn" role="alert">
            <strong>Error</strong>
            <div style={{ marginTop: 6 }} className="small">{error}</div>
          </div>
        )}

        {response && response.ok === false && response.reason === "low_confidence" && (
          <div className={`catalog-card ${animate ? "animate-in" : ""}`}>
            <div className="catalog-header">
              <div>
                <h2 className="catalog-title">Unable to build catalogue</h2>
                <p className="catalog-desc">The system could not reliably extract a catalogue from this transcript.</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small">Confidence</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{(response.confidence ?? 0).toFixed(2)}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small"><strong>Why?</strong></div>
              <div style={{ marginTop: 8 }}>{response.note ?? "The content or structure of the chat made extraction uncertain."}</div>
            </div>
          </div>
        )}

        {response && response.ok === true && response.parsedCatalogue && (
          <article className={`catalog-card ${animate ? "animate-in" : ""}`} aria-labelledby="catalog-title">
            <div className="catalog-header">
              <div>
                <h2 className="catalog-title" id="catalog-title">{response.parsedCatalogue.title}</h2>
                <p className="catalog-desc">{response.parsedCatalogue.description}</p>
                <div style={{ marginTop: 8 }} className="small">Saved Catalogue ID: <strong>{response.catalogId}</strong></div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div className="small">Items</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{response.storedItemsCount}</div>
              </div>
            </div>

            {/* categories */}
            {response.parsedCatalogue.categories.map((cat, idx) => (
              <section className="category" key={idx}>
                <h4>{cat.name}</h4>
                <div>
                  {cat.items.map((it, i2) => (
                    <div className="item" key={i2}>
                      <div className="left">
                        <div className="avatar">{(it.name || "").split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight:700 }}>{it.name}</div>
                          {it.description && <div className="meta">{it.description}</div>}
                          {it.tags && it.tags.length > 0 && (
                            <div className="tags" aria-hidden="true">
                              {it.tags.map((t, ti) => <span className="tag" key={ti}>{t}</span>)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="price">
                        {it.price ? `₹${it.price}` : <span style={{ color: 'var(--muted)', fontWeight:700 }}>—</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* small export row per category (optional) */}
              </section>
            ))}

            <footer style={{ marginTop: 18 }} className="small">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>Export catalogue:</span>
                <a className="link-btn" href={exportUrl(response.catalogId, "csv")}>CSV</a>
                {/* <a className="link-btn" href={exportUrl(response.catalogId, "json")}>JSON</a> */}
                {/* <a className="link-btn" href={exportUrl(response.catalogId, "md")}>Markdown</a> */}
              </div>
              <div style={{ marginTop: 8 }}>Tip: CSV is ideal for spreadsheets.</div>
            </footer>
          </article>
        )}
      </section>
    </div>
  );
}
