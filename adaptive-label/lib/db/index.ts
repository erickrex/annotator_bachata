/**
 * `@/lib/db` — the single entry point for database access.
 *
 * Re-exports:
 * - the pooled connection primitives (`getPool`, `query`, `ping`) from ./client
 * - the typed, per-table query helpers from ./queries
 * - row/column types from ./types
 * - pgvector serialization helpers from ./vector
 *
 * Existing imports such as `import { ping } from "@/lib/db"` (the health route)
 * keep working unchanged.
 */

export { getPool, query, ping } from "./client";
export * from "./types";
export * from "./vector";
export * from "./queries";
export * from "./activate-schema";
export * from "./schema-from-rows";
export * from "./submit-annotation";
