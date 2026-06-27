/**
 * Centralized, typed access to environment variables.
 *
 * This is scaffolding for the AdaptiveLabel backbone (Requirement 7.5):
 * a single place that documents and reads the env vars the app needs.
 * Values are read lazily so importing this module never throws at build time;
 * call `getServerEnv()` from server-only code paths (route handlers, server
 * actions, the seed script) where the variables are actually required.
 */

export interface ServerEnv {
  /** Aurora PostgreSQL connection string (pooled / serverless-safe). */
  DATABASE_URL: string;
  /** AI provider key for the Vercel AI SDK. */
  OPENAI_API_KEY: string;
  /** Embedding model id; must match the stored vector dimension. */
  AI_EMBEDDING_MODEL: string;
  /** Embedding dimension; must equal clips.embedding vector(N). */
  AI_EMBEDDING_DIMENSIONS: number;
  /** Public base URL that demo media clips are served from. */
  STORAGE_PUBLIC_BASE_URL: string;
  /** Local filesystem root for runtime uploads, downloads, renders, and WAVs. */
  ADAPTIVE_LABEL_MEDIA_DIR: string;
  /** Runtime processing mode. v1 supports in_process. */
  MEDIA_PROCESSING_MODE: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Read and validate the server-side environment. Throws if a required
 * variable is missing. Intended for server-only execution contexts.
 */
export function getServerEnv(): ServerEnv {
  return {
    DATABASE_URL: required("DATABASE_URL"),
    OPENAI_API_KEY: required("OPENAI_API_KEY"),
    AI_EMBEDDING_MODEL: optional("AI_EMBEDDING_MODEL", "text-embedding-3-small"),
    AI_EMBEDDING_DIMENSIONS: Number(optional("AI_EMBEDDING_DIMENSIONS", "1536")),
    STORAGE_PUBLIC_BASE_URL: optional("STORAGE_PUBLIC_BASE_URL"),
    ADAPTIVE_LABEL_MEDIA_DIR: optional("ADAPTIVE_LABEL_MEDIA_DIR", ".media"),
    MEDIA_PROCESSING_MODE: optional("MEDIA_PROCESSING_MODE", "in_process"),
  };
}
