// pages/index.js
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return alert("Pick a .txt file first");
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

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", fontFamily: "system-ui, Arial" }}>
      <h1>Chat → Catalogue (Gemini)</h1>
      <p>Upload a chat .txt and the app will try to extract a catalogue. If the model is uncertain, it will explain why instead of producing a catalogue.</p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <input
          type="file"
          accept=".txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button type="submit" disabled={loading} style={{ marginLeft: 12 }}>
          {loading ? "Processing…" : "Upload & Process"}
        </button>
      </form>

      {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}

      {response && (
        <>
          {response.ok === false && response.reason === "low_confidence" ? (
            <div style={{ border: "1px solid #f5c6cb", background: "#fff1f2", padding: 16, borderRadius: 8 }}>
              <h3 style={{ marginTop: 0 }}>Unable to build catalogue — low confidence</h3>
              <p><strong>Confidence:</strong> {(response.confidence ?? 0).toFixed(2)}</p>
              <p><strong>Model note:</strong> {response.note}</p>
              <details style={{ marginTop: 8 }}>
                <summary>Show model raw output</summary>
                <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{response.rawModelOutput}</pre>
              </details>
            </div>
          ) : response.ok === true ? (
            <div>
              <h2>Saved Catalogue (ID: {response.catalogId})</h2>
              <p>Stored items: {response.storedItemsCount}</p>

              <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 8 }}>
                <h3>{response.parsedCatalogue.title}</h3>
                <p>{response.parsedCatalogue.description}</p>

                {response.parsedCatalogue.categories.map((cat, idx) => (
                  <div key={idx} style={{ marginTop: 16 }}>
                    <h4>{cat.name}</h4>
                    <ul>
                      {cat.items.map((it, i2) => (
                        <li key={i2} style={{ marginBottom: 8 }}>
                          <strong>{it.name}</strong>
                          {it.price ? ` — ₹${it.price}` : ""}
                          <div style={{ fontSize: 13, color: "#444" }}>{it.description}</div>
                          {it.tags && it.tags.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              {it.tags.map((t, ti) => (
                                <span key={ti} style={{ padding: "2px 8px", marginRight: 6, background: "#f1f1f1", borderRadius: 12, fontSize: 12 }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
