// Cycle Builder — pure functions for constructing bachata cycle hierarchy.
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

import type { Cycle, CycleHierarchy, Phrase } from '../types/index.js';

const BEATS_PER_CYCLE = 8;

/**
 * Group beats into 8-count Cycle objects starting from the downbeat index,
 * then assemble 16-count and 32-count Phrase objects.
 *
 * Leftover beats that don't form a complete 8-count cycle are discarded.
 */
export function buildCycles(
  beatGridFrames: number[],
  beatGridTimestamps: number[],
  downbeatIndex: number,
): CycleHierarchy {
  const beatsFromDownbeat = beatGridTimestamps.length - downbeatIndex;
  const cycleCount = Math.floor(beatsFromDownbeat / BEATS_PER_CYCLE);

  const cycles8: Cycle[] = [];
  for (let i = 0; i < cycleCount; i++) {
    const startIdx = downbeatIndex + i * BEATS_PER_CYCLE;
    const endIdx = startIdx + BEATS_PER_CYCLE - 1;
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

  const phrases16 = buildPhrases(cycles8, 2);
  const phrases32 = buildPhrases(cycles8, 4);

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
