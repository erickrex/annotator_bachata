import * as React from "react";

import type { TimelineMode } from "@/lib/schemas/workspace";
import type { BeatGridMetadata, GlossSegmentsMetadata } from "@/lib/seed/types";
import { BeatGridTimeline } from "./BeatGridTimeline";
import { GlossSegmentTimeline } from "./GlossSegmentTimeline";
import { PhaseRepTimeline } from "./PhaseRepTimeline";
import type { TimelineMetadata } from "./types";

/** Timeline modes this renderer knows how to mount, as a runtime guard set. */
const KNOWN_TIMELINE_MODES = new Set<string>([
  "beat_grid",
  "phase_rep",
  "gloss_segments",
]);

export interface TimelineForModeProps {
  /**
   * The active schema's `timelineMode`. Typed as `TimelineMode`, but the switch
   * also defends against data outside the allowed set (mirroring the
   * deterministic-renderer trust model): unknown modes render a safe fallback.
   */
  timelineMode: TimelineMode;
  /**
   * The clip's seeded timeline metadata. Its `timelineMode` discriminant should
   * match `timelineMode`; modules that need metadata guard their own shape.
   */
  metadata?: TimelineMetadata | null;
  /** Optional override for the project frame rate. */
  fps?: number;
  /** Optional extra class names forwarded to the mounted module. */
  className?: string;
}

/**
 * The single, fixed switch that mounts a timeline module from the active
 * schema's `timelineMode` (Req 2.6). This is the ONLY place a mode resolves to
 * a component — there is no data-driven dispatch and no runtime code execution;
 * the schema/metadata supply data, never a component to run.
 *
 * - `beat_grid` → `BeatGridTimeline` (bachata, Req 3.1)
 * - `gloss_segments` → `GlossSegmentTimeline` (sign language, Req 3.2)
 * - `phase_rep` → `PhaseRepTimeline` (roadmap stub, not seeded)
 * - unknown/mismatched → safe fallback (renders nothing)
 */
export function TimelineForMode({
  timelineMode,
  metadata,
  fps,
  className,
}: TimelineForModeProps) {
  // Defensive runtime guard: the mode may be untrusted data. If it is not a
  // known mode, skip it rather than dispatch on an arbitrary value.
  if (!timelineMode || !KNOWN_TIMELINE_MODES.has(timelineMode)) {
    return null;
  }

  switch (timelineMode) {
    case "beat_grid":
      // Guard the discriminant so a mismatched metadata shape can't be coerced.
      if (!metadata || metadata.timelineMode !== "beat_grid") {
        return null;
      }
      return (
        <BeatGridTimeline
          metadata={metadata as BeatGridMetadata}
          fps={fps}
          className={className}
        />
      );

    case "gloss_segments":
      if (!metadata || metadata.timelineMode !== "gloss_segments") {
        return null;
      }
      return (
        <GlossSegmentTimeline
          metadata={metadata as GlossSegmentsMetadata}
          fps={fps}
          className={className}
        />
      );

    case "phase_rep":
      // Not seeded; the stub needs no metadata.
      return <PhaseRepTimeline className={className} />;

    default:
      // Unreachable for valid TimelineMode values; skip safely otherwise.
      return null;
  }
}

export { KNOWN_TIMELINE_MODES };
