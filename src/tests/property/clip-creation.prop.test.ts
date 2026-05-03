// Feature: configurable-beat-count, Property 2: Clip creation produces correct clips for any valid beat count
// **Validates: Requirements 2.2, 3.2, 3.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips } from '../../services/clip-manager.js';

/**
 * Arbitrary that produces a valid (beatsPerCycle, beatGridFrames, beatGridTimestamps) tuple.
 * The beat grid always has at least `beatsPerCycle` entries so at least one cycle is produced.
 */
const validBeatGridArb = fc
  .constantFrom(4 as const, 8 as const, 16 as const, 32 as const)
  .chain((beatsPerCycle) =>
    fc
      .integer({ min: beatsPerCycle, max: beatsPerCycle * 4 })
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
          // fps: common frame rates
          fc.constantFrom(24, 25, 30, 60),
          // sourceId: non-empty alphanumeric string
          fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/),
        ),
      ),
  );

describe('Property 2: Clip creation produces correct clips for any valid beat count', () => {
  it('(a) each clip beatCount field equals the requested beat count', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps, fps, sourceId]) => {
        const cycles = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const clips = createClips(sourceId, cycles, beatsPerCycle, fps, frames);

        expect(clips.length).toBeGreaterThan(0);
        for (const clip of clips) {
          expect(clip.beatCount).toBe(beatsPerCycle);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(b) each clip clipId matches the pattern {sourceId}_c\\d{3}_\\d{3}', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps, fps, sourceId]) => {
        const cycles = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const clips = createClips(sourceId, cycles, beatsPerCycle, fps, frames);

        const pattern = new RegExp(`^${sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_c\\d{3}_\\d{3}$`);
        for (const clip of clips) {
          expect(clip.clipId).toMatch(pattern);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(c) each clip durationInFrames is positive', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps, fps, sourceId]) => {
        const cycles = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const clips = createClips(sourceId, cycles, beatsPerCycle, fps, frames);

        for (const clip of clips) {
          expect(clip.remotion.durationInFrames).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(d) clip count equals cycle count in the hierarchy', () => {
    fc.assert(
      fc.property(validBeatGridArb, ([beatsPerCycle, frames, timestamps, fps, sourceId]) => {
        const cycles = buildCycles(frames, timestamps, 0, beatsPerCycle);
        const clips = createClips(sourceId, cycles, beatsPerCycle, fps, frames);

        expect(clips.length).toBe(cycles.cycles8.length);
      }),
      { numRuns: 100 },
    );
  });
});
