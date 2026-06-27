// Minimal domain types required by the transplanted pure beat/cycle logic.
//
// These are extracted from the existing Astro repo's `src/types` so the pure
// domain modules (cycle-builder, clip-manager, beat-marker-utils) can run in the
// Next.js app WITHOUT importing the full bachata annotation schema/enum catalog.
// Only the shapes actually used by the pure logic are reproduced here.

/** Lifecycle status of a virtual clip. */
export type ClipStatus =
  | 'pending'
  | 'discarded'
  | 'reviewed'
  | 'in_progress'
  | 'annotated';

// ---------------------------------------------------------------------------
// Cycle Hierarchy
// ---------------------------------------------------------------------------

export interface Cycle {
  cycleNumber: number;
  startBeatIndex: number;
  endBeatIndex: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: number;
  endTimestamp: number;
}

export interface Phrase {
  phraseNumber: number;
  cycles: Cycle[];
  startFrame: number;
  endFrame: number;
}

export interface CycleHierarchy {
  cycles8: Cycle[]; // base cycles (size determined by beatsPerCycle)
  phrases16: Phrase[]; // 16-count musical phrases
  phrases32: Phrase[]; // 32-count extended phrases
}

// ---------------------------------------------------------------------------
// Virtual Clip Definition
// ---------------------------------------------------------------------------

export interface VirtualClipDef {
  clipId: string;
  sourceId: string;
  status: ClipStatus;
  remotion: {
    fromFrame: number;
    durationInFrames: number;
    fps: number;
  };
  beatMarkerFrames: number[]; // beat frame numbers relative to clip
  cycleNumber: number;
  beatCount: number;
  /** Path to the extracted clip MP4 (relative to project root). Set after extraction. */
  extractedFile?: string;
  /** Seconds of extra footage before the logical clip start. */
  handleBefore?: number;
  /** Seconds of extra footage after the logical clip end. */
  handleAfter?: number;
  /** In-point offset in seconds from the start of the extracted file (default = handleBefore). */
  inPoint?: number;
  /** Out-point offset in seconds from the start of the extracted file. */
  outPoint?: number;
}
