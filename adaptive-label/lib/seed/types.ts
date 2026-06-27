/**
 * Typed shapes for the offline seed dataset in `seed/*.json` (Task 6.1).
 *
 * The seed script (Task 6.2, `scripts/seed.ts`) imports these to read the
 * dataset, build each clip's `search_text`, compute embeddings, and insert
 * projects / schemas / clips / tasks into Aurora. Keeping the shapes here means
 * the JSON contract is type-checked at the consumer.
 *
 * The dataset is generated deterministically by `scripts/generate-seed.mjs`.
 */

import type { TimelineMode } from "@/lib/schemas/workspace";

/** `seed/projects.json` — the dataset manifest. */
export interface SeedManifest {
  generatedBy: string;
  ipClean: boolean;
  projects: SeedProjectEntry[];
}

/** One project entry in the manifest. `presetKey` selects a `PRESETS` schema. */
export interface SeedProjectEntry {
  slug: string;
  name: string;
  domain: string;
  presetKey: "bachata" | "sign_language";
  timelineMode: TimelineMode;
  /** Relative filename of the per-project clip dataset (in `seed/`). */
  clipsFile: string;
}

/** A `seed/clips.<project>.json` file. */
export interface SeedClipDataset {
  projectSlug: string;
  timelineMode: TimelineMode;
  fps: number;
  mediaAssets: SeedMediaAsset[];
  clips: SeedClip[];
}

/** Maps to a `media_assets` row. */
export interface SeedMediaAsset {
  /** Stable local key used to link a clip to its asset within the dataset. */
  key: string;
  filename: string;
  storageKey: string;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
}

/** Maps to a `clips` row (minus the offline-computed `search_text`/`embedding`). */
export interface SeedClip {
  clipIndex: number;
  title: string;
  domain: string;
  /** References a `SeedMediaAsset.key` in the same dataset. */
  mediaAssetKey: string;
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  /**
   * Attribute keys mirror the domain's PRESET field keys. The seed script
   * concatenates these into the clip's `search_text` (the input to embedding).
   */
  searchAttributes: Record<string, unknown>;
  /** Seeded timeline metadata: a beat grid (bachata) or gloss segments (sign). */
  metadata: BeatGridMetadata | GlossSegmentsMetadata;
}

/**
 * Beat grid produced (in production) by the Python `beat_this` analyzer
 * (`analyzer/analyze.py`). `beatGrid` matches that CLI's JSON output contract.
 */
export interface BeatGridMetadata {
  timelineMode: "beat_grid";
  beatGrid: AnalyzerBeatGrid;
  phrasing: {
    beatsPerCycle: number;
    downbeatIndex: number;
    countsPerPhrase16: number;
    countsPerPhrase32: number;
  };
  provenance: "analyzer" | "hand-authored-placeholder";
}

/** Mirrors the stdout JSON of `uv run python -m analyzer <wav> --fps <fps>`. */
export interface AnalyzerBeatGrid {
  bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_timestamps: number[];
  beat_frames: number[];
  energy_profile: number[];
}

/** Hand-authored gloss-segment timeline for the sign-language domain. */
export interface GlossSegmentsMetadata {
  timelineMode: "gloss_segments";
  glossSegments: GlossSegment[];
  phrases: GlossPhrase[];
  provenance: "hand-authored";
}

export interface GlossSegment {
  index: number;
  gloss: string;
  sign_type: string;
  dominant_hand: string;
  two_handed: boolean;
  handshapes: string[];
  non_manual_markers: string;
  clarity: number;
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  phrase: number;
}

export interface GlossPhrase {
  phrase: number;
  label: string;
  startSeconds: number;
  endSeconds: number;
  glossIndices: number[];
}
