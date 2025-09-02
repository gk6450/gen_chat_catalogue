# 📘 Chat → Catalogue

Convert group chat transcripts (WhatsApp/Telegram/Instagram/business chats) into a clean, validated catalogue/menu using a generative LLM and a small Next.js full‑stack app.

This repository is a working end‑to‑end project that allows a user to:

* Upload a `.txt` conversation file
* Call a server-side LLM (Google Gemini / Vertex AI) to extract a structured catalogue
* Validate the model output and only persist it when confidence is high
* Store catalogs and items in Postgres (Vercel Postgres / Neon / Supabase)
* View results in a responsive, professional blue-themed UI
* Export catalogues as CSV

---

## 🔗 Quick links

* **Frontend:** Next.js pages (`/`, `/catalogs`, `/catalogs/[id]`)
* **API routes:** `POST /api/upload`, `GET /api/catalogs`, `GET /api/catalogs/:id`, `GET /api/catalogs/:id/export?format=csv`, `GET /api/catalogs/:id/download`
* **DB migration:** `sql/migration.sql`
* **Sample transcript:** `public/example-chat.txt`

---

## 🛠️ Tech stack

* Frontend & Backend: **Next.js** (React + API Routes)
* Database: **Postgres** (use Vercel Postgres / Neon / Supabase)
* LLM: **Google Gemini** (via Vertex AI or HTTP) - server-side only
* Validation: **zod** (server-side schema checks)
* Styling: CSS (single `styles/globals.css`) - professional blue theme

---

## 🚀 Features

* Upload `.txt` chat transcripts and extract catalogues.
* AI Model must return strict JSON with a top-level `confidence` (0–1) and **either** `catalog` or `note`.
* Server enforces a `CONFIDENCE_THRESHOLD` (default `0.75`) - low-confidence responses are **not** persisted.
* DB schema stores `catalogs` and `items` with meta and source text.
* Responsive UI, animations after successful save.
* Export: CSV. Download catalogue from the UI.

---

## ⚡ Quick start (local)

### ⚙️ Prerequisites

* Node.js 18+ (project `package.json` requires `>=18`)
* PostgreSQL (remote or local)
* Gemini/Vertex AI access (service account / API key)
* `psql` CLI (optional, for running migrations)

### 1. Clone repository

```bash
git clone https://github.com/gk6450/gen_chat_catalogue.git
cd gen_chat_catalogue
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment variables

Create a `.env` in the project root (never commit secrets). Required variables:

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
CONFIDENCE_THRESHOLD=0.75 (optional)
NODE_ENV=production (optional)
```

### 4. Run DB migration

A simple SQL migration is provided at `sql/migration.sql`. Run it using `psql`:

```bash
psql "$DATABASE_URL" -f sql/migration.sql
```

If you prefer, use the provider dashboard SQL editor (Neon / Supabase) to run the migration.

### 5. Start dev server

```bash
npm run dev
# open http://localhost:3000
```

---

## 🔑 Environment variables

* `DATABASE_URL` - Postgres connection string (required)
* `GEMINI_API_KEY` - API key or token for Gemini/Gen AI (if using REST)
* `NODE_ENV` - production or development
* `CONFIDENCE_THRESHOLD` - decimal between 0 and 1 to require before persistence (default `0.75`)

---

## 📡 API reference

### `POST /api/upload`

* Accepts `multipart/form-data` with field `file` (a `.txt` file)
* Server reads file, calls LLM, expects strict JSON output and validates with Zod.
* Returns:

  * `200 { ok: true, catalogId, storedItemsCount, confidence, parsedCatalogue }` when saved
  * `200 { ok: false, reason: 'low_confidence', confidence, note }` when low confidence (no save)
  * `4xx/5xx` for errors

### `GET /api/catalogs`

* Returns a list of saved catalogs with counts.

### `GET /api/catalogs/:id`

* Returns catalog metadata and grouped items.

### `GET /api/catalogs/:id/export?format=csv|json|md`

* Returns an attachment for download in the chosen format.

### `GET /api/catalogs/:id/download`

* Returns the original transcript as `.txt` (attachment).

---

## 🎨 Frontend overview

* `/` - Upload UI. Shows parsed catalogue on success and export csv button.
* `/catalogs` - List of saved catalogues with quick actions.
* `/catalogs/:id` - Detail page. Export button (CSV) is available here.

### UI features:

* Professional blue theme (see `styles/globals.css`).
* Subtle animations when results appear.
* Accessible button focus outlines and responsive layout.

---

## 🧠 How the server prompts the model (high-level)

The server sends a deterministic instruction (temperature 0.0), asking the model to return only strict JSON, include `confidence`, and produce the `catalog` structure. The model is asked to normalize prices and use `General` for uncertain categories.

(See `pages/api/upload.js` for the exact system/user prompt used.)

---

## 📂 Files of interest

* `pages/api/upload.js` - main upload handler & LLM call
* `pages/api/catalogs/*` - listing, detail, export endpoints
* `pages/index.js`, `pages/catalogs/index.js`, `pages/catalogs/[id].js` - frontend pages
* `styles/globals.css` - theme & layout (blue professional theme)
* `sql/migration.sql` - DB schema
* `public/favicon.svg` - site favicon
* `public/example-chat.txt` - sample transcript for quick testing

---