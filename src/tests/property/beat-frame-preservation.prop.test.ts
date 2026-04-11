// Feature: integration-fixes, Property 2: Preservation — Clip Structural Invariants Under Frame-Space Change
// **Validates: Requirements 3.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips, mergeClips, splitClip } from '../../services/clip-manager.js';

// ---------------------------------------------------------------------------
// Shared generator: random beat grid → CycleHierarchy
// ---------------------------------------------------------------------------

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
  .tuple(
    fc.integer({ min: 32, max: 120 }),
    fc.float({ min: 0, max: 30, noNaN: true }),
    fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true }),
    fc.integer({ min: 24, max: 60 }),
  )
  .chain(([count, start, interval, fpsVal]) => {
    const maxDownbeat = Math.min(7, count - 32);
    return fc
      .integer({ min: 0, max: Math.max(0, maxDownbeat) })
      .map((downbeat) => makeBeatGridAndCycles(count, start, interval, fpsVal, downbeat));
  });

const clipBeatCount = fc.constantFrom(8 as const, 16 as const, 32 as const);

// ---------------------------------------------------------------------------
// createClips structural invariants
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Clip Structural Invariants Under Frame-Space Change', () => {
  describe('createClips structural invariants', () => {
    it('beat marker count equals beatCount for every generated clip', () => {
      fc.assert(
        fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
          const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
          for (const clip of clips) {
            expect(clip.beatMarkerFrames.length).toBe(clip.beatCount);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('durationInFrames > 0 for every generated clip', () => {
      fc.assert(
        fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
          const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
          for (const clip of clips) {
            expect(clip.remotion.durationInFrames).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('fromFrame >= 0 for every generated clip', () => {
      fc.assert(
        fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
          const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
          for (const clip of clips) {
            expect(clip.remotion.fromFrame).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('clip IDs follow {sourceId}_c{NNN}_{NNN} pattern', () => {
      fc.assert(
        fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
          const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
          const idPattern = /^src1_c\d{3}_\d{3}$/;
          for (const clip of clips) {
            expect(clip.clipId).toMatch(idPattern);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // mergeClips structural invariants
  // ---------------------------------------------------------------------------

  describe('mergeClips structural invariants', () => {
    it('merged beat count = sum of input beat counts', () => {
      fc.assert(
        fc.property(beatGridArb, (grid) => {
          const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
          if (clips.length < 2) return;

          for (let i = 0; i < clips.length - 1; i++) {
            const merged = mergeClips(clips[i], clips[i + 1]);
            expect(merged.beatCount).toBe(clips[i].beatCount + clips[i + 1].beatCount);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('merged marker count = sum of input marker counts', () => {
      fc.assert(
        fc.property(beatGridArb, (grid) => {
          const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
          if (clips.length < 2) return;

          for (let i = 0; i < clips.length - 1; i++) {
            const merged = mergeClips(clips[i], clips[i + 1]);
            expect(merged.beatMarkerFrames.length).toBe(
              clips[i].beatMarkerFrames.length + clips[i + 1].beatMarkerFrames.length,
            );
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // splitClip structural invariants
  // ---------------------------------------------------------------------------

  describe('splitClip structural invariants', () => {
    it('split partitions beat markers at the split boundary', () => {
      fc.assert(
        fc.property(beatGridArb, (grid) => {
          const clips = createClips('src1', grid.hierarchy, 16, grid.fpsVal);
          if (clips.length === 0) return;

          for (const clip of clips) {
            const midFrame =
              clip.remotion.fromFrame + Math.floor(clip.remotion.durationInFrames / 2);
            const [a, b] = splitClip(clip, midFrame, grid.hierarchy);

            // All markers are partitioned: total markers = a markers + b markers
            expect(a.beatMarkerFrames.length + b.beatMarkerFrames.length).toBe(
              clip.beatMarkerFrames.length,
            );
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
