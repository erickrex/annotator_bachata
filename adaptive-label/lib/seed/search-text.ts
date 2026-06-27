/**
 * Pure helper that builds a clip's `search_text` — the text representation that
 * is embedded offline by the seed pipeline (Task 6.2) and stored on the clip
 * row (Requirement 5.2).
 *
 * It is deliberately dependency-free and deterministic so it can be unit- and
 * property-tested without a database or AI provider, and so that re-running the
 * seed yields byte-identical search text (and therefore stable embeddings).
 *
 * The text concatenates the clip's title, its domain, and a stable,
 * key-sorted rendering of its `searchAttributes` (whose keys mirror the
 * domain's PRESET field keys). Embedding never happens here or in any request
 * path — this module only produces the *input* string (Requirements 5.5, 8.4).
 */

/** Minimal shape needed to build search text (a subset of `SeedClip`). */
export interface SearchTextInput {
  title: string;
  domain: string;
  searchAttributes: Record<string, unknown>;
}

/**
 * Render a single attribute value into a stable, human-readable string.
 * Arrays are joined; booleans become yes/no; null/undefined become "".
 * Nested objects are rendered with sorted keys so output stays deterministic.
 */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => renderValue(item))
      .filter((part) => part !== "")
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => {
        const rendered = renderValue((value as Record<string, unknown>)[key]);
        return rendered === "" ? "" : `${key}: ${rendered}`;
      })
      .filter((part) => part !== "")
      .join(", ");
  }
  return String(value);
}

/**
 * Build a clip's deterministic `search_text`.
 *
 * The result is the title (when present), the domain, and each non-empty
 * `searchAttributes` entry (in sorted-key order) joined by " | ". Given any
 * input whose `domain` is non-empty, the output is a non-empty string, because
 * the domain is always included.
 */
export function buildSearchText(input: SearchTextInput): string {
  const parts: string[] = [];

  const title = input.title?.trim() ?? "";
  if (title !== "") {
    parts.push(title);
  }

  const domain = input.domain?.trim() ?? "";
  if (domain !== "") {
    parts.push(`domain: ${domain}`);
  }

  for (const key of Object.keys(input.searchAttributes).sort()) {
    const rendered = renderValue(input.searchAttributes[key]).trim();
    if (rendered !== "") {
      parts.push(`${key}: ${rendered}`);
    }
  }

  return parts.join(" | ");
}
