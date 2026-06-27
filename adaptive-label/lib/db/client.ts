import { Pool } from "pg";
import type { PoolConfig, QueryResult, QueryResultRow } from "pg";

import { getServerEnv } from "@/lib/env";

/**
 * Pooled Postgres (Aurora) client for serverless execution.
 *
 * A single `Pool` is shared across module reloads and warm lambda invocations
 * via a `globalThis` singleton. This keeps the connection count bounded on
 * Aurora (Requirement 7.3 — a serverless-safe, pooled connection approach) and
 * avoids exhausting connections on cold starts / HMR.
 *
 * This module owns the low-level connection primitives (`getPool`, `query`,
 * `ping`). The typed, per-table query helpers live in ./queries and build on
 * top of these. Both are re-exported from ./index so `@/lib/db` is the single
 * entry point.
 */

type GlobalWithPool = typeof globalThis & {
  __adaptiveLabelPgPool?: Pool;
};

const globalForPg = globalThis as GlobalWithPool;

function createPool(): Pool {
  const env = getServerEnv();

  const config: PoolConfig = {
    connectionString: env.DATABASE_URL,
    // Keep the per-instance pool small: serverless functions are short-lived
    // and many concurrent instances each hold their own pool.
    max: Number(process.env.PG_POOL_MAX ?? "3"),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? "10000"),
    connectionTimeoutMillis: Number(
      process.env.PG_CONNECTION_TIMEOUT_MS ?? "10000",
    ),
  };

  // Aurora requires TLS. When the connection string does not already pin a
  // verified CA, accept the managed certificate without local CA verification.
  if (!/sslmode=(verify-full|verify-ca)/.test(env.DATABASE_URL)) {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

/**
 * Return the shared pooled client, creating it lazily on first use so that
 * importing this module never opens a connection or reads env at build time.
 */
export function getPool(): Pool {
  if (!globalForPg.__adaptiveLabelPgPool) {
    globalForPg.__adaptiveLabelPgPool = createPool();
  }
  return globalForPg.__adaptiveLabelPgPool;
}

/**
 * Run a parameterized query against the pooled client.
 *
 * Always pass user-supplied values via `params` (never string-interpolated)
 * to keep queries injection-safe.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params as unknown[] | undefined);
}

/**
 * Trivial connectivity probe used by `/api/health`. Returns `true` when a
 * round-trip `SELECT 1` succeeds against Aurora.
 */
export async function ping(): Promise<boolean> {
  const result = await query<{ ok: number }>("select 1 as ok");
  return result.rows[0]?.ok === 1;
}
