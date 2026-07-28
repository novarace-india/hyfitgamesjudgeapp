import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS hyfit_ops");
  await pool.query("SET search_path TO hyfit_ops,public");
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const directory = path.resolve("db/migrations");
  for (const name of (await fs.readdir(directory)).filter((item) => item.endsWith(".sql")).sort()) {
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(directory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
