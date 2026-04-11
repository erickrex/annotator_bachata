// Feature: clip-slicer-annotator, Property 5: Virtual Clip Structural Invariants
// **Validates: Requirements 4.2, 4.3, 4.6, 4.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips } from '../../services/clip-manager.js';

describe('Property 5: Virtual Clip Structural Invariants', () => {
  // Generators
  const beatCount = fc.integer({ min: 32, max: 200 });
  const startTime = fc.float({ min: 0, max: 10, noNaN: true });
  const beatInterval = fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true });
  const fps = fc.integer({ min: 24, max: 60 });
  const clipBeatCount = fc.constantFrom(8 as const, 16 as const, 32 as const);

  /** Build a uniform beat grid and CycleHierarchy from generated values. */
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
    // Compute a reasonable totalFrames (last beat frame + some buffer)
    const totalFrames = frames.length > 0 ? frames[frames.length - 1] + Math.round(fpsVal * 10) : 0;
    return { timestamps, frames, hierarchy, totalFrames, fpsVal };
  }

  const beatGridArb = fc
    .tuple(beatCount, startTime, beatInterval, fps)
    .chain(([count, start, interval, fpsVal]) => {
      const maxDownbeat = Math.min(7, count - 32);
      return fc
        .integer({ min: 0, max: Math.max(0, maxDownbeat) })
        .map((downbeat) => makeBeatGridAndCycles(count, start, interval, fpsVal, downbeat));
    });

  it('(a) fromFrame is non-negative for all generated clips', () => {
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

  it('(b) durationInFrames is positive for all generated clips', () => {
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

  it('(c) clip starts on a beat that is count 1 or count 5 (beat index 0 or 4 within a cycle)', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
        const cycles = grid.hierarchy.cycles8;

        for (const clip of clips) {
          // Find the cycle whose startFrame matches the clip's fromFrame
          const matchingCycle = cycles.find((c) => c.startFrame === clip.remotion.fromFrame);
          // The clip must start on a cycle boundary (count 1).
          // Count 5 would be at beat index 4 within a cycle, which is the midpoint.
          // Since createClips groups complete cycles, each clip starts at a cycle's startFrame.
          // A cycle's startBeatIndex corresponds to count 1 of that cycle.
          // For count 5, the beat index within the cycle would be 4.
          // The clip starts on count 1 (cycle start) — this is the primary case.
          // We verify the fromFrame matches a cycle start (count 1) or the midpoint (count 5).
          const isCycleStart = matchingCycle !== undefined;
          const isMidCycle = cycles.some((c) => {
            // count 5 is beat index 4 within the cycle
            // The frame for beat 4 can be interpolated
            const midBeatFrame = Math.round(
              c.startFrame + (4 / 7) * (c.endFrame - c.startFrame),
            );
            return midBeatFrame === clip.remotion.fromFrame;
          });
          expect(isCycleStart || isMidCycle).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(d) clip spans exactly beatCount beats where beatCount is a multiple of 8', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
        for (const clip of clips) {
          expect(clip.beatCount).toBe(bc);
          expect(clip.beatCount % 8).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(e) clip frame range does not exceed a reasonable total frames value', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
        for (const clip of clips) {
          const endFrame = clip.remotion.fromFrame + clip.remotion.durationInFrames - 1;
          expect(endFrame).toBeLessThanOrEqual(grid.totalFrames);
        }
      }),
      { numRuns: 100 },
    );
  });
});
