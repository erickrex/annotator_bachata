import type {
  BeatGridMetadata,
  GlossSegmentsMetadata,
} from "@/lib/seed/types";

/**
 * The seeded timeline metadata carried on a clip's `metadata_json`. It is a
 * discriminated union keyed by `timelineMode`; the deterministic renderer uses
 * the active schema's `timelineMode` to pick the matching module (Req 2.6).
 *
 * `PhaseRepTimeline` is a roadmap stub and is NOT seeded, so it has no metadata
 * shape here.
 */
export type TimelineMetadata = BeatGridMetadata | GlossSegmentsMetadata;

/** Common presentational props shared by the concrete timeline modules. */
export interface TimelineModuleProps<T> {
  /** Seeded, offline-computed timeline metadata for the clip. */
  metadata: T;
  /** Optional override for the project frame rate (defaults per metadata/30). */
  fps?: number;
  /** Optional extra class names for the timeline container. */
  className?: string;
}
