import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || "";
if (!connectionString) {
  console.warn("WARNING: DATABASE_URL not set. DB calls will fail until you set it.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export { pool };
