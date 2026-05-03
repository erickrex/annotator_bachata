// Clip Manager — pure functions for creating, merging, splitting, and adjusting virtual clips.
// Requirements: 2.2, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.7, 5.8, 5.9

import type { CycleHierarchy, Cycle, VirtualClipDef } from '../types/index.js';

const DEFAULT_BEATS_PER_CYCLE = 8;

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

// ---------------------------------------------------------------------------
// createClips
// ---------------------------------------------------------------------------

/**
 * Generate VirtualClipDef objects from a CycleHierarchy at the given beat count.
 *
 * The cycle builder produces cycles at the requested beat count size, so each
 * cycle in the hierarchy maps 1:1 to a clip. For backward compatibility, if
 * the cycles are smaller than the requested beat count (e.g., 8-beat cycles
 * with beatCount=16), consecutive cycles are grouped to form clips of the
 * correct size.
 *
 * Each clip starts on count 1 (start of a cycle) and spans complete cycles.
 * Beat marker frames are the beat frame numbers within the clip's range.
 */
export function createClips(
  sourceId: string,
  cycles: CycleHierarchy,
  beatCount: 4 | 8 | 16 | 32,
  fps: number,
  beatGridFrames?: number[],
): VirtualClipDef[] {
  const allCycles = cycles.cycles8;
  if (allCycles.length === 0) return [];

  // Determine the actual beats per cycle from the data
  const beatsPerCycleInData = allCycles[0].endBeatIndex - allCycles[0].startBeatIndex + 1;

  // How many cycles from the hierarchy are needed to form one clip
  const cyclesPerClip = beatCount / beatsPerCycleInData;
  const clipCount = cyclesPerClip >= 1
    ? Math.floor(allCycles.length / cyclesPerClip)
    : allCycles.length; // each cycle maps 1:1 when cycles are already the right size

  const effectiveCyclesPerClip = cyclesPerClip >= 1 ? cyclesPerClip : 1;

  const clips: VirtualClipDef[] = [];

  for (let i = 0; i < clipCount; i++) {
    const group = allCycles.slice(i * effectiveCyclesPerClip, (i + 1) * effectiveCyclesPerClip);
    const firstCycle = group[0];
    const lastCycle = group[group.length - 1];

    const fromFrame = firstCycle.startFrame;
    const endFrame = lastCycle.endFrame;
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
        beatMarkerFrames.push(...interpolateBeatFrames(cycle, beatsPerCycleInData));
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
 * A cycle spans beatsPerCycle beats from startFrame to endFrame.
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

  const beatCountA = cyclesA.length * DEFAULT_BEATS_PER_CYCLE;
  const beatCountB = cyclesB.length * DEFAULT_BEATS_PER_CYCLE;

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


