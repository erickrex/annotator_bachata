// Feature: clip-slicer-annotator, Property 6: Clip ID Convention
// **Validates: Requirements 4.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips } from '../../services/clip-manager.js';

describe('Property 6: Clip ID Convention', () => {
  const beatCount = fc.integer({ min: 32, max: 200 });
  const startTime = fc.float({ min: 0, max: 10, noNaN: true });
  const beatInterval = fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true });
  const fps = fc.integer({ min: 24, max: 60 });
  const clipBeatCount = fc.constantFrom(8 as const, 16 as const, 32 as const);
  const sourceId = fc.stringMatching(/^[a-zA-Z0-9_]{1,20}$/);

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

  it('clip ID matches {sourceId}_c{cycleNumber:03d}_{beatCount:03d}', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, sourceId, (grid, bc, srcId) => {
        const clips = createClips(srcId, grid.hierarchy, bc, grid.fpsVal);
        for (const clip of clips) {
          const expectedCycle = String(clip.cycleNumber).padStart(3, '0');
          const expectedBeats = String(clip.beatCount).padStart(3, '0');
          const expectedId = `${srcId}_c${expectedCycle}_${expectedBeats}`;
          expect(clip.clipId).toBe(expectedId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('cycle number is zero-padded to exactly 3 digits', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
        for (const clip of clips) {
          // Extract the cycle part from the clip ID
          const match = clip.clipId.match(/_c(\d{3})_/);
          expect(match).not.toBeNull();
          expect(match![1]).toBe(String(clip.cycleNumber).padStart(3, '0'));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('beat count is zero-padded to exactly 3 digits', () => {
    fc.assert(
      fc.property(beatGridArb, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);
        for (const clip of clips) {
          // Extract the beat count part from the clip ID
          const match = clip.clipId.match(/_(\d{3})$/);
          expect(match).not.toBeNull();
          expect(match![1]).toBe(String(clip.beatCount).padStart(3, '0'));
        }
      }),
      { numRuns: 100 },
    );
  });
});
