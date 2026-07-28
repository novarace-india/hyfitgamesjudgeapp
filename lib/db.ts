import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var hyfitPool: Pool | undefined;
}

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for central operations");
  return value;
}

export function getPool() {
  if (!globalThis.hyfitPool) {
    globalThis.hyfitPool = new Pool({
      connectionString: databaseUrl(),
      options: "-c search_path=hyfit_ops,public",
      max: Number(process.env.DATABASE_POOL_SIZE ?? 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return globalThis.hyfitPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
