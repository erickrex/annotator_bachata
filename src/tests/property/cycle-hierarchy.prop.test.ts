// Feature: clip-slicer-annotator, Property 3: Cycle Hierarchy Structure
// **Validates: Requirements 3.1, 3.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';

describe('Property 3: Cycle Hierarchy Structure', () => {
  // Generators
  const beatCount = fc.integer({ min: 8, max: 200 });
  const startTime = fc.float({ min: 0, max: 10, noNaN: true });
  const beatInterval = fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true });
  const fps = fc.integer({ min: 24, max: 60 });

  /** Build a uniform beat grid and a valid downbeat index from generated values. */
  function makeBeatGrid(
    count: number,
    start: number,
    interval: number,
    fpsVal: number,
    downbeat: number,
  ) {
    const timestamps = Array.from({ length: count }, (_, i) => start + i * interval);
    const frames = timestamps.map((t) => Math.round(t * fpsVal));
    return { timestamps, frames, downbeat };
  }

  const beatGridArb = fc
    .tuple(beatCount, startTime, beatInterval, fps)
    .chain(([count, start, interval, fpsVal]) => {
      const maxDownbeat = Math.min(7, count - 8);
      return fc
        .integer({ min: 0, max: Math.max(0, maxDownbeat) })
        .map((downbeat) => ({ count, start, interval, fpsVal, downbeat }));
    })
    .map(({ count, start, interval, fpsVal, downbeat }) =>
      makeBeatGrid(count, start, interval, fpsVal, downbeat),
    );

  it('(a) each 8-count cycle contains exactly 8 consecutive beats', () => {
    fc.assert(
      fc.property(beatGridArb, ({ timestamps, frames, downbeat }) => {
        const { cycles8 } = buildCycles(frames, timestamps, downbeat);

        for (const cycle of cycles8) {
          const beatSpan = cycle.endBeatIndex - cycle.startBeatIndex + 1;
          expect(beatSpan).toBe(8);
        }

        // Consecutive: each cycle starts right after the previous one ends
        for (let i = 1; i < cycles8.length; i++) {
          expect(cycles8[i].startBeatIndex).toBe(cycles8[i - 1].endBeatIndex + 1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(b) each 16-count phrase contains exactly 2 consecutive 8-count cycles', () => {
    fc.assert(
      fc.property(beatGridArb, ({ timestamps, frames, downbeat }) => {
        const { cycles8, phrases16 } = buildCycles(frames, timestamps, downbeat);

        for (const phrase of phrases16) {
          expect(phrase.cycles).toHaveLength(2);

          // The two cycles must be consecutive in the cycles8 array
          const idx0 = cycles8.indexOf(phrase.cycles[0]);
          const idx1 = cycles8.indexOf(phrase.cycles[1]);
          expect(idx0).toBeGreaterThanOrEqual(0);
          expect(idx1).toBe(idx0 + 1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(c) each 32-count phrase contains exactly 4 consecutive 8-count cycles', () => {
    fc.assert(
      fc.property(beatGridArb, ({ timestamps, frames, downbeat }) => {
        const { cycles8, phrases32 } = buildCycles(frames, timestamps, downbeat);

        for (const phrase of phrases32) {
          expect(phrase.cycles).toHaveLength(4);

          // The four cycles must be consecutive in the cycles8 array
          const idx0 = cycles8.indexOf(phrase.cycles[0]);
          expect(idx0).toBeGreaterThanOrEqual(0);
          for (let j = 1; j < 4; j++) {
            expect(cycles8.indexOf(phrase.cycles[j])).toBe(idx0 + j);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(d) no beat appears in more than one cycle at the same level', () => {
    fc.assert(
      fc.property(beatGridArb, ({ timestamps, frames, downbeat }) => {
        const { cycles8, phrases16, phrases32 } = buildCycles(frames, timestamps, downbeat);

        // Check 8-count level: beat index ranges must not overlap
        const seen8 = new Set<number>();
        for (const cycle of cycles8) {
          for (let b = cycle.startBeatIndex; b <= cycle.endBeatIndex; b++) {
            expect(seen8.has(b)).toBe(false);
            seen8.add(b);
          }
        }

        // Check 16-count level: phrase beat ranges must not overlap
        const seen16 = new Set<number>();
        for (const phrase of phrases16) {
          for (const cycle of phrase.cycles) {
            for (let b = cycle.startBeatIndex; b <= cycle.endBeatIndex; b++) {
              expect(seen16.has(b)).toBe(false);
              seen16.add(b);
            }
          }
        }

        // Check 32-count level: phrase beat ranges must not overlap
        const seen32 = new Set<number>();
        for (const phrase of phrases32) {
          for (const cycle of phrase.cycles) {
            for (let b = cycle.startBeatIndex; b <= cycle.endBeatIndex; b++) {
              expect(seen32.has(b)).toBe(false);
              seen32.add(b);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
