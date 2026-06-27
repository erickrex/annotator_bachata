import { PRESETS, type WorkspaceSchema } from "@/lib/schemas/workspace";

/**
 * Which deterministic preset a free-text description maps to.
 *
 * The preset is used as the live-generation fallback (Requirement 1.9). The
 * mapping must honour the same domain → timeline rules the model is instructed
 * to follow: a sign-language description maps to the gloss-segment preset
 * (Requirement 1.5) and a rhythmic/musical description maps to the beat-grid
 * preset (Requirement 1.4).
 */
export type FallbackDomain = keyof typeof PRESETS;

/**
 * Keywords that strongly imply a sign-language annotation dataset. Checked
 * first because they are the more specific signal.
 */
const SIGN_LANGUAGE_KEYWORDS = [
  "sign language",
  "sign-language",
  "signlanguage",
  "sign ",
  "signing",
  "signer",
  "gloss",
  "asl",
  "bsl",
  "lsf",
  "fingerspell",
  "handshape",
  "deaf",
  "non-manual",
];

/**
 * Keywords that imply a rhythmic / musical movement domain (beat grid).
 */
const RHYTHMIC_KEYWORDS = [
  "bachata",
  "salsa",
  "dance",
  "dancing",
  "dancer",
  "beat",
  "rhythm",
  "rhythmic",
  "musical",
  "music",
  "tempo",
  "choreograph",
  "footwork",
  "step",
  "count",
  "phrase",
];

function matches(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * Infer the fallback domain from a description. Sign language is detected first
 * (more specific); rhythmic/musical maps to bachata. When nothing matches we
 * default to the bachata beat-grid preset — the primary demo domain — so the
 * workflow never hard-fails (Requirement 1.9).
 */
export function selectFallbackDomain(description: string): FallbackDomain {
  const normalized = description.toLowerCase();

  if (matches(normalized, SIGN_LANGUAGE_KEYWORDS)) {
    return "sign_language";
  }
  if (matches(normalized, RHYTHMIC_KEYWORDS)) {
    return "bachata";
  }
  return "bachata";
}

/**
 * Return the deterministic preset schema for a description. The returned object
 * is a defensive deep copy so callers can never mutate the shared `PRESETS`.
 */
export function selectFallbackPreset(description: string): WorkspaceSchema {
  const domain = selectFallbackDomain(description);
  return structuredClone(PRESETS[domain]);
}
