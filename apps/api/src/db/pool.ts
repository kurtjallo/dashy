import pg from 'pg';
import { config } from '../config/env.js';

/** Single shared pg connection pool — Postgres is the only state of record. */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

/** Run a parameterized query and return the rows array. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(sql, params as unknown[] | undefined);
  return result.rows as T[];
}
