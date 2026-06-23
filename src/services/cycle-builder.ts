// Cycle Builder — pure functions for constructing bachata cycle hierarchy.

import type { Cycle, CycleHierarchy, Phrase } from '../types/index.js';

/**
 * Group beats into Cycle objects of the specified size starting from the
 * downbeat index, then assemble 16-count and 32-count Phrase objects.
 *
 * Leftover beats that don't form a complete cycle are discarded.
 *
 * @param beatsPerCycle - Number of beats per cycle (4, 8, 16, or 32). Defaults to 8.
 */
export function buildCycles(
  beatGridFrames: number[],
  beatGridTimestamps: number[],
  downbeatIndex: number,
  beatsPerCycle: 4 | 8 | 16 | 32 = 8,
): CycleHierarchy {
  const beatsFromDownbeat = beatGridTimestamps.length - downbeatIndex;
  const cycleCount = Math.floor(beatsFromDownbeat / beatsPerCycle);

  const cycles8: Cycle[] = [];
  for (let i = 0; i < cycleCount; i++) {
    const startIdx = downbeatIndex + i * beatsPerCycle;
    const endIdx = startIdx + beatsPerCycle - 1;
    cycles8.push({
      cycleNumber: i + 1,
      startBeatIndex: startIdx,
      endBeatIndex: endIdx,
      startFrame: beatGridFrames[startIdx],
      endFrame: beatGridFrames[endIdx],
      startTimestamp: beatGridTimestamps[startIdx],
      endTimestamp: beatGridTimestamps[endIdx],
    });
  }

  // Compute how many base cycles make up 16 beats and 32 beats
  const cyclesFor16Beats = 16 / beatsPerCycle;
  const cyclesFor32Beats = 32 / beatsPerCycle;

  const phrases16 = cyclesFor16Beats >= 1
    ? buildPhrases(cycles8, cyclesFor16Beats)
    : [];
  const phrases32 = cyclesFor32Beats >= 1
    ? buildPhrases(cycles8, cyclesFor32Beats)
    : [];

  return { cycles8, phrases16, phrases32 };
}

/**
 * Shift the entire beat grid by an offset in milliseconds and recompute
 * frame numbers from the shifted timestamps.
 */
export function shiftBeatGrid(
  beatGridTimestamps: number[],
  offsetMs: number,
  fps: number,
): { timestamps: number[]; frames: number[] } {
  const offsetSeconds = offsetMs / 1000;
  const timestamps = beatGridTimestamps.map((t) => t + offsetSeconds);
  const frames = timestamps.map((t) => Math.round(t * fps));
  return { timestamps, frames };
}

/**
 * Rebuild the cycle hierarchy from a new downbeat index.
 * Delegates directly to buildCycles.
 */
export function recomputeWithDownbeat(
  beatGridFrames: number[],
  beatGridTimestamps: number[],
  newDownbeatIndex: number,
): CycleHierarchy {
  return buildCycles(beatGridFrames, beatGridTimestamps, newDownbeatIndex);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Group consecutive cycles into phrases of `cyclesPerPhrase` size. */
function buildPhrases(cycles: Cycle[], cyclesPerPhrase: number): Phrase[] {
  const phraseCount = Math.floor(cycles.length / cyclesPerPhrase);
  const phrases: Phrase[] = [];

  for (let i = 0; i < phraseCount; i++) {
    const group = cycles.slice(
      i * cyclesPerPhrase,
      (i + 1) * cyclesPerPhrase,
    );
    phrases.push({
      phraseNumber: i + 1,
      cycles: group,
      startFrame: group[0].startFrame,
      endFrame: group[group.length - 1].endFrame,
    });
  }

  return phrases;
}
