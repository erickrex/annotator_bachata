import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Request-handler safety guard (Correctness Property 5 — Embedding/query separation).
 *
 * Runtime media processing is now an explicit capability of AdaptiveLabel, so
 * media routes may call into ffmpeg, Python, yt-dlp, and Remotion. Request
 * handlers must still never compute embeddings: similarity search uses stored
 * vectors only, and embedding production remains outside the request path.
 *
 * This test statically scans every route handler under `app/api/**` and asserts
 * none of them reference the forbidden capabilities. It is a structural guard:
 * if someone later wires live embedding generation into a route, the suite
 * fails before it can ship.
 *
 * The route files deliberately *document* this constraint in their comments
 * (e.g. "never compute an embedding here"), so comments and string-free doc
 * prose are stripped before scanning — we only inspect executable code.
 */

const API_ROOT = dirname(fileURLToPath(import.meta.url));

/** Recursively collect every Next.js route handler file under `app/api`. */
function collectRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(full));
    } else if (/^route\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Remove block comments, line comments, and string/template literals so the
 * forbidden-pattern scan only sees executable code. Stripping string literals
 * also avoids flagging any incidental prose passed as data.
 */
function stripCommentsAndStrings(source: string): string {
  return (
    source
      // block comments
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      // line comments
      .replace(/\/\/[^\n]*/g, " ")
      // double / single quoted strings
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      // template literals
      .replace(/`(?:[^`\\]|\\.)*`/g, "``")
  );
}

interface ForbiddenPattern {
  /** Human-readable capability being forbidden. */
  capability: string;
  /** Regex matched against comment/string-stripped code. */
  pattern: RegExp;
}

/**
 * Forbidden embedding capabilities for request handlers. Patterns are matched against
 * code with comments and string literals removed, so they target real imports
 * and call sites rather than documentation.
 */
const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // Embedding generation in the request path (Property 5).
  {
    capability: "embedding generation (embed / embedMany)",
    pattern: /\bembed(Many|One|Texts)?\s*\(/,
  },
  {
    capability: "embedding import from the AI SDK",
    pattern: /\bimport\b[^;]*\bembed(Many)?\b[^;]*from\s*['"]ai['"]/,
  },
];

describe("request-handler safety (Property 5)", () => {
  const routeFiles = collectRouteFiles(API_ROOT);

  it("discovers the API route handlers to scan", () => {
    // Sanity check: the scan must actually find handlers, otherwise a future
    // refactor that moves routes could make this guard silently vacuous.
    expect(routeFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(routeFiles.map((file) => [relative(API_ROOT, file), file] as const))(
    "route %s does not compute embeddings",
    (_label, file) => {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      const violations = FORBIDDEN_PATTERNS.filter(({ pattern }) =>
        pattern.test(code),
      ).map(({ capability }) => capability);

      expect(
        violations,
        `Request handler ${relative(API_ROOT, file)} must not reference: ${violations.join(", ")}. ` +
          "Embeddings must be produced outside request handlers; routes may only read stored vectors.",
      ).toEqual([]);
    },
  );
});
