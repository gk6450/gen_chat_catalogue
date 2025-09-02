CREATE TABLE IF NOT EXISTS catalogs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source_text TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  catalog_id INTEGER REFERENCES catalogs(id) ON DELETE CASCADE,
  category TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC,
  tags TEXT[],
  extra JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
