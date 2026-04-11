// Clip Manager — pure functions for creating, merging, splitting, and adjusting virtual clips.
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.7, 5.8, 5.9

import type { CycleHierarchy, Cycle, VirtualClipDef } from '../types/index.js';

const BEATS_PER_CYCLE = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-pad a number to 3 digits. */
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Generate a clip ID following the convention {sourceId}_c{cycleNumber:03d}_{beatCount:03d}. */
function makeClipId(sourceId: string, cycleNumber: number, beatCount: number): string {
  return `${sourceId}_c${pad3(cycleNumber)}_${pad3(beatCount)}`;
}



/** Find the nearest frame in a sorted array. */
function snapToNearest(frame: number, grid: number[]): number {
  if (grid.length === 0) return frame;

  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] < frame) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first element >= frame
  if (lo === 0) return grid[0];
  const prev = grid[lo - 1];
  const curr = grid[lo];
  return Math.abs(frame - prev) <= Math.abs(frame - curr) ? prev : curr;
}

// ---------------------------------------------------------------------------
// createClips
// ---------------------------------------------------------------------------

/**
 * Generate VirtualClipDef objects from a CycleHierarchy at the given beat count.
 *
 * - beatCount=8  → each 8-count cycle becomes one clip
 * - beatCount=16 → each pair of consecutive cycles becomes one clip
 * - beatCount=32 → each group of 4 consecutive cycles becomes one clip
 *
 * Each clip starts on count 1 (start of a cycle) and spans complete cycles.
 * Beat marker frames are the beat frame numbers within the clip's range.
 */
export function createClips(
  sourceId: string,
  cycles: CycleHierarchy,
  beatCount: 8 | 16 | 32,
  fps: number,
  beatGridFrames?: number[],
): VirtualClipDef[] {
  const cyclesPerClip = beatCount / BEATS_PER_CYCLE;
  const allCycles = cycles.cycles8;
  const clipCount = Math.floor(allCycles.length / cyclesPerClip);

  const clips: VirtualClipDef[] = [];

  for (let i = 0; i < clipCount; i++) {
    const group = allCycles.slice(i * cyclesPerClip, (i + 1) * cyclesPerClip);
    const firstCycle = group[0];
    const lastCycle = group[group.length - 1];

    const fromFrame = firstCycle.startFrame;
    const endFrame = lastCycle.endFrame;
    // durationInFrames = endFrame - fromFrame + 1 would include the last beat frame.
    // However, the clip spans from the start of the first beat to the start of the
    // next cycle (or the last beat of the last cycle). We use endFrame - fromFrame
    // so the clip covers up to (but not including) the next cycle's first frame.
    // But endFrame here is the frame of the last beat in the group, so duration
    // should include that frame: endFrame - fromFrame + 1.
    const durationInFrames = endFrame - fromFrame + 1;

    // Beat markers: prefer the original beat grid when available so markers stay
    // faithful to the analyzer output. Fall back to interpolation in tests and
    // callers that only provide cycle boundaries.
    const beatMarkerFrames: number[] = [];
    for (const cycle of group) {
      if (beatGridFrames && beatGridFrames.length > cycle.endBeatIndex) {
        beatMarkerFrames.push(
          ...beatGridFrames.slice(cycle.startBeatIndex, cycle.endBeatIndex + 1),
        );
      } else {
        beatMarkerFrames.push(...interpolateBeatFrames(cycle, BEATS_PER_CYCLE));
      }
    }

    // Convert beat markers from source-absolute to clip-relative frame space.
    // Remotion's useCurrentFrame() returns 0-based frames relative to clip start,
    // so beat markers must also be 0-based relative to fromFrame.
    const clipRelativeMarkers = beatMarkerFrames.map(f => f - fromFrame);

    clips.push({
      clipId: makeClipId(sourceId, firstCycle.cycleNumber, beatCount),
      sourceId,
      status: 'pending',
      remotion: { fromFrame, durationInFrames, fps },
      beatMarkerFrames: clipRelativeMarkers,
      cycleNumber: firstCycle.cycleNumber,
      beatCount,
    });
  }

  return clips;
}

/**
 * Interpolate beat frame positions within a cycle.
 * A cycle spans BEATS_PER_CYCLE beats from startFrame to endFrame.
 * We linearly interpolate to get each beat's frame.
 */
function interpolateBeatFrames(cycle: Cycle, beatsPerCycle: number): number[] {
  const frames: number[] = [];
  for (let b = 0; b < beatsPerCycle; b++) {
    const t = b / (beatsPerCycle - 1);
    frames.push(Math.round(cycle.startFrame + t * (cycle.endFrame - cycle.startFrame)));
  }
  return frames;
}

// ---------------------------------------------------------------------------
// mergeClips
// ---------------------------------------------------------------------------

/**
 * Merge two adjacent clips into one.
 * New fromFrame = clipA.fromFrame, new durationInFrames = sum of both.
 * New clip ID uses clipA's cycle number. Beat markers are concatenated.
 */
export function mergeClips(
  clipA: VirtualClipDef,
  clipB: VirtualClipDef,
): VirtualClipDef {
  const mergedBeatCount = clipA.beatCount + clipB.beatCount;
  const clipBOffset = clipA.remotion.durationInFrames;

  return {
    clipId: makeClipId(clipA.sourceId, clipA.cycleNumber, mergedBeatCount),
    sourceId: clipA.sourceId,
    status: 'pending',
    remotion: {
      fromFrame: clipA.remotion.fromFrame,
      durationInFrames: clipA.remotion.durationInFrames + clipB.remotion.durationInFrames,
      fps: clipA.remotion.fps,
    },
    beatMarkerFrames: [
      ...clipA.beatMarkerFrames,
      ...clipB.beatMarkerFrames.map((frame) => frame + clipBOffset),
    ],
    cycleNumber: clipA.cycleNumber,
    beatCount: mergedBeatCount,
  };
}

// ---------------------------------------------------------------------------
// splitClip
// ---------------------------------------------------------------------------

/**
 * Split a clip at the cycle boundary closest to splitAtFrame.
 * Returns two new clips, each with a new clip ID.
 */
export function splitClip(
  clip: VirtualClipDef,
  splitAtFrame: number,
  cycles: CycleHierarchy,
): [VirtualClipDef, VirtualClipDef] {
  // Find cycles that belong to this clip's frame range.
  const clipFrom = clip.remotion.fromFrame;
  const clipEnd = clipFrom + clip.remotion.durationInFrames - 1;

  const clipCycles = cycles.cycles8.filter(
    (c) => c.startFrame >= clipFrom && c.endFrame <= clipEnd,
  );

  if (clipCycles.length < 2) {
    throw new Error('Clip must contain at least two cycles to be split.');
  }

  // Find the cycle boundary closest to splitAtFrame.
  // Cycle boundaries are the startFrame of each cycle (except the first, which is the clip start).
  // We want to split between two cycles, so we look at startFrames of cycles after the first.
  let bestIdx = 1; // split after at least the first cycle
  let bestDist = Infinity;
  for (let i = 1; i < clipCycles.length; i++) {
    const dist = Math.abs(clipCycles[i].startFrame - splitAtFrame);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  const cyclesA = clipCycles.slice(0, bestIdx);
  const cyclesB = clipCycles.slice(bestIdx);

  const beatCountA = cyclesA.length * BEATS_PER_CYCLE;
  const beatCountB = cyclesB.length * BEATS_PER_CYCLE;

  const splitFrame = cyclesB[0].startFrame;
  const splitOffset = splitFrame - clipFrom;

  // Split beat markers
  const markersA = clip.beatMarkerFrames.filter((f) => f < splitOffset);
  const markersB = clip.beatMarkerFrames
    .filter((f) => f >= splitOffset)
    .map((f) => f - splitOffset);

  const clipADef: VirtualClipDef = {
    clipId: makeClipId(clip.sourceId, cyclesA[0].cycleNumber, beatCountA),
    sourceId: clip.sourceId,
    status: 'pending',
    remotion: {
      fromFrame: clipFrom,
      durationInFrames: splitFrame - clipFrom,
      fps: clip.remotion.fps,
    },
    beatMarkerFrames: markersA,
    cycleNumber: cyclesA[0].cycleNumber,
    beatCount: beatCountA,
  };

  const clipBDef: VirtualClipDef = {
    clipId: makeClipId(clip.sourceId, cyclesB[0].cycleNumber, beatCountB),
    sourceId: clip.sourceId,
    status: 'pending',
    remotion: {
      fromFrame: splitFrame,
      durationInFrames: clipEnd - splitFrame + 1,
      fps: clip.remotion.fps,
    },
    beatMarkerFrames: markersB,
    cycleNumber: cyclesB[0].cycleNumber,
    beatCount: beatCountB,
  };

  return [clipADef, clipBDef];
}

// ---------------------------------------------------------------------------
// adjustBoundary
// ---------------------------------------------------------------------------

/**
 * Adjust a clip's start and/or end frame, snapping to the nearest beat-aligned
 * position from the beat grid. Pass null to leave a boundary unchanged.
 */
export function adjustBoundary(
  clip: VirtualClipDef,
  newFromFrame: number | null,
  newEndFrame: number | null,
  beatGridFrames: number[],
): VirtualClipDef {
  const currentFrom = clip.remotion.fromFrame;
  const currentEnd = currentFrom + clip.remotion.durationInFrames - 1;

  const adjustedFrom = newFromFrame !== null
    ? snapToNearest(newFromFrame, beatGridFrames)
    : currentFrom;

  const adjustedEnd = newEndFrame !== null
    ? snapToNearest(newEndFrame, beatGridFrames)
    : currentEnd;

  const durationInFrames = adjustedEnd - adjustedFrom + 1;

  const beatMarkerFrames = beatGridFrames
    .filter((frame) => frame >= adjustedFrom && frame <= adjustedEnd)
    .map((frame) => frame - adjustedFrom);

  return {
    ...clip,
    remotion: {
      ...clip.remotion,
      fromFrame: adjustedFrom,
      durationInFrames,
    },
    beatMarkerFrames,
  };
}
