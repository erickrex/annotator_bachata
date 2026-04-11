// Feature: clip-slicer-annotator, Property 7: Merge Preserves Frame Coverage
// Feature: clip-slicer-annotator, Property 8: Split Preserves Frame Coverage
// Feature: clip-slicer-annotator, Property 9: Split-then-Merge Round-Trip
// **Validates: Requirements 5.7, 5.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips, mergeClips, splitClip } from '../../services/clip-manager.js';
import type { CycleHierarchy } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const beatCount = fc.integer({ min: 32, max: 200 });
const startTime = fc.float({ min: 0, max: 10, noNaN: true });
const beatInterval = fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true });
const fps = fc.integer({ min: 24, max: 60 });

function makeBeatGridAndCycles(
  count: number,
  start: number,
  interval: number,
  fpsVal: number,
  downbeat: number,
) {
  const timestamps = Array.from({ length: count }, (_, i) => start + i * interval);
  const frames = timestamps.map((t) => Math.round(t * fpsVal));
  const hierarchy = buildCycles(frames, timestamps, downbeat);
  return { hierarchy, fpsVal };
}

const beatGridArb = fc
  .tuple(beatCount, startTime, beatInterval, fps)
  .chain(([count, start, interval, fpsVal]) => {
    const maxDownbeat = Math.min(7, count - 32);
    return fc
      .integer({ min: 0, max: Math.max(0, maxDownbeat) })
      .map((downbeat) => makeBeatGridAndCycles(count, start, interval, fpsVal, downbeat));
  });

// ---------------------------------------------------------------------------
// Property 7: Merge Preserves Frame Coverage
// ---------------------------------------------------------------------------

describe('Property 7: Merge Preserves Frame Coverage', () => {
  it('merging two adjacent clips produces fromFrame = A.fromFrame and durationInFrames = A + B', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        // Create 8-beat clips so we have many adjacent pairs
        const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
        if (clips.length < 2) return; // need at least 2 clips

        for (let i = 0; i < clips.length - 1; i++) {
          const clipA = clips[i];
          const clipB = clips[i + 1];
          const merged = mergeClips(clipA, clipB);

          expect(merged.remotion.fromFrame).toBe(clipA.remotion.fromFrame);
          expect(merged.remotion.durationInFrames).toBe(
            clipA.remotion.durationInFrames + clipB.remotion.durationInFrames,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Split Preserves Frame Coverage
// ---------------------------------------------------------------------------

describe('Property 8: Split Preserves Frame Coverage', () => {
  it('splitting a clip produces two clips whose combined frame range equals the original', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        // Create 16-beat clips so they can be split into 8-beat halves
        const clips = createClips('src1', grid.hierarchy, 16, grid.fpsVal);
        if (clips.length === 0) return;

        for (const clip of clips) {
          // Split at the midpoint frame (should snap to cycle boundary)
          const midFrame = clip.remotion.fromFrame + Math.floor(clip.remotion.durationInFrames / 2);
          const [a, b] = splitClip(clip, midFrame, grid.hierarchy);

          // Non-overlapping and contiguous
          expect(a.remotion.fromFrame).toBe(clip.remotion.fromFrame);
          expect(b.remotion.fromFrame).toBe(a.remotion.fromFrame + a.remotion.durationInFrames);

          // Combined frame range equals original
          expect(a.remotion.durationInFrames + b.remotion.durationInFrames).toBe(
            clip.remotion.durationInFrames,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Split-then-Merge Round-Trip
// ---------------------------------------------------------------------------

describe('Property 9: Split-then-Merge Round-Trip', () => {
  it('splitting then merging produces a clip with the same fromFrame and durationInFrames', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        const clips = createClips('src1', grid.hierarchy, 16, grid.fpsVal);
        if (clips.length === 0) return;

        for (const clip of clips) {
          const midFrame = clip.remotion.fromFrame + Math.floor(clip.remotion.durationInFrames / 2);
          const [a, b] = splitClip(clip, midFrame, grid.hierarchy);
          const roundTripped = mergeClips(a, b);

          expect(roundTripped.remotion.fromFrame).toBe(clip.remotion.fromFrame);
          expect(roundTripped.remotion.durationInFrames).toBe(clip.remotion.durationInFrames);
        }
      }),
      { numRuns: 100 },
    );
  });
});
