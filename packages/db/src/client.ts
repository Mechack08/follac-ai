import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

let _db: Database | null = null;
let _pool: pg.Pool | null = null;

/**
 * Lazily create the shared connection pool + Drizzle client.
 * Server and worker both call this; the pool is created once per process.
 */
export function getDb(): Database {
  if (_db) return _db;
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot connect to PostgreSQL");
  }
  _pool = new pg.Pool({ connectionString, max: 10 });
  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
