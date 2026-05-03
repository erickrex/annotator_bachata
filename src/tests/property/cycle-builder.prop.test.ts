// Feature: configurable-beat-count, Property 1: Cycle builder produces correctly-sized cycles
// **Validates: Requirements 3.1, 4.2, 4.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';

/**
 * Arbitrary that produces a valid (beatsPerCycle, beatGridFrames, beatGridTimestamps) tuple.
 * The beat grid always has at least `beatsPerCycle` entries so at least one cycle is produced.
 */
const validBeatGridArb = fc
  .constantFrom(4 as const, 8 as const, 16 as const, 32 as const)
  .chain((beatsPerCycle) =>
    fc
      .integer({ min: beatsPerCycle, max: beatsPerCycle + 32 })
      .chain((length) =>
        fc.tuple(
          fc.constant(beatsPerCycle),
          // beatGridFrames: sorted increasing integers (use positive deltas)
          fc
            .array(fc.integer({ min: 1, max: 100 }), { minLength: length, maxLength: length })
            .map((deltas) => {
              const frames: number[] = [];
              let acc = 0;
              for (const d of deltas) {
                acc += d;
                frames.push(acc);
              }
              return frames;
            }),
          // beatGridTimestamps: sorted increasing floats
          fc
            .array(fc.double({ min: 0.01, max: 2.0, noNaN: true, noDefaultInfinity: true }), {
              minLength: length,
              maxLength: length,
            })
            .map((deltas) => {
              const timestamps: number[] = [];
              let acc = 0;
              for (const d of deltas) {
                acc += d;
                timestamps.push(acc);
              }
              return timestamps;
            }),
        ),
      ),
  );

describe('Property 1: Cycle builder produces correctly-sized cycles', () => {
  it('each cycle spans exactly beatsPerCycle beat indices', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps]) => {
        const result = buildCycles(frames, timestamps, 0, beatsPerCycle);

        expect(result.cycles8.length).toBeGreaterThan(0);
        for (const cycle of result.cycles8) {
          const span = cycle.endBeatIndex - cycle.startBeatIndex + 1;
          expect(span).toBe(beatsPerCycle);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('total beats consumed equals cycleCount * beatsPerCycle', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps]) => {
        const result = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const cycleCount = result.cycles8.length;
        const totalBeatsConsumed = cycleCount * beatsPerCycle;

        // Total consumed should not exceed available beats
        expect(totalBeatsConsumed).toBeLessThanOrEqual(frames.length);
        // And the leftover should be less than beatsPerCycle
        expect(frames.length - totalBeatsConsumed).toBeLessThan(beatsPerCycle);
      }),
      { numRuns: 100 },
    );
  });

  it('leftover beats (less than beatsPerCycle) are discarded', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps]) => {
        const result = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const expectedCycleCount = Math.floor(frames.length / beatsPerCycle);

        expect(result.cycles8.length).toBe(expectedCycleCount);
      }),
      { numRuns: 100 },
    );
  });
});
