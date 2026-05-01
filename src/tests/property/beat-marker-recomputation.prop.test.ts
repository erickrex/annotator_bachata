// Feature: codebase-cleanup, Property 5: Beat marker recomputation preserves only in-range beats relative to trim start
// **Validates: Requirements 7.1, 7.2, 7.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { recomputeBeatMarkers } from '../../services/beat-marker-utils.js';
import type { VirtualClipDef } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a VirtualClipDef with valid remotion timing and optional trim points.
 * The beat grid is generated as source-absolute frame numbers.
 */
const virtualClipWithBeatsArb = fc
  .record({
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    inPointFraction: fc.float({ min: 0, max: Math.fround(0.8), noNaN: true, noDefaultInfinity: true }),
    outPointFraction: fc.float({ min: Math.fround(0.2), max: 1, noNaN: true, noDefaultInfinity: true }),
    beatCount: fc.integer({ min: 0, max: 50 }),
  })
  .filter(({ inPointFraction, outPointFraction }) => inPointFraction < outPointFraction)
  .chain(({ fromFrame, durationInFrames, fps, inPointFraction, outPointFraction, beatCount }) => {
    const clipDurationSeconds = durationInFrames / fps;
    const inPoint = Math.fround(inPointFraction * clipDurationSeconds);
    const outPoint = Math.fround(outPointFraction * clipDurationSeconds);

    // Generate beat frames spread across a wider range than the clip
    // to ensure some beats fall inside and some outside the trimmed range
    const totalSourceRange = fromFrame + durationInFrames + 500;
    const beatGridArb = fc.array(
      fc.integer({ min: Math.max(0, fromFrame - 200), max: totalSourceRange }),
      { minLength: beatCount, maxLength: beatCount },
    ).map((frames) => frames.sort((a, b) => a - b));

    return beatGridArb.map((sourceBeatGridFrames) => {
      const clip: VirtualClipDef = {
        clipId: 'test_clip_001_008',
        sourceId: 'test_source',
        status: 'draft' as const,
        remotion: { fromFrame, durationInFrames, fps },
        beatMarkerFrames: [],
        cycleNumber: 1,
        beatCount: 8,
        inPoint: inPoint > 0 ? inPoint : undefined,
        outPoint: outPoint < clipDurationSeconds ? outPoint : undefined,
      };
      return { clip, sourceBeatGridFrames };
    });
  });

/**
 * Generate a VirtualClipDef with NO trim points set (defaults to full clip range).
 */
const virtualClipNoTrimArb = fc
  .record({
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    beatCount: fc.integer({ min: 0, max: 50 }),
  })
  .chain(({ fromFrame, durationInFrames, fps, beatCount }) => {
    const totalSourceRange = fromFrame + durationInFrames + 500;
    const beatGridArb = fc.array(
      fc.integer({ min: Math.max(0, fromFrame - 200), max: totalSourceRange }),
      { minLength: beatCount, maxLength: beatCount },
    ).map((frames) => frames.sort((a, b) => a - b));

    return beatGridArb.map((sourceBeatGridFrames) => {
      const clip: VirtualClipDef = {
        clipId: 'test_clip_001_008',
        sourceId: 'test_source',
        status: 'draft' as const,
        remotion: { fromFrame, durationInFrames, fps },
        beatMarkerFrames: [],
        cycleNumber: 1,
        beatCount: 8,
      };
      return { clip, sourceBeatGridFrames };
    });
  });

// ---------------------------------------------------------------------------
// Helper: compute expected absolute range for a clip
// ---------------------------------------------------------------------------

function getAbsoluteRange(clip: VirtualClipDef): { absoluteStart: number; absoluteEnd: number } {
  const { fromFrame, durationInFrames, fps } = clip.remotion;
  const inPointSeconds = clip.inPoint ?? 0;
  const outPointSeconds = clip.outPoint ?? durationInFrames / fps;
  const inPointFrame = Math.round(inPointSeconds * fps);
  const outPointFrame = Math.round(outPointSeconds * fps);
  return {
    absoluteStart: fromFrame + inPointFrame,
    absoluteEnd: fromFrame + outPointFrame,
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 5: Beat marker recomputation preserves only in-range beats relative to trim start', () => {
  it('all returned markers are non-negative (relative to trim start)', () => {
    fc.assert(
      fc.property(virtualClipWithBeatsArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        for (const marker of result) {
          expect(marker).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all returned markers correspond to source beats within the absolute trimmed range', () => {
    fc.assert(
      fc.property(virtualClipWithBeatsArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        const { absoluteStart, absoluteEnd } = getAbsoluteRange(clip);

        for (const marker of result) {
          // Reconstruct the source-absolute frame from the relative marker
          const sourceFrame = marker + absoluteStart;
          expect(sourceFrame).toBeGreaterThanOrEqual(absoluteStart);
          expect(sourceFrame).toBeLessThan(absoluteEnd);
          // The source frame must exist in the original beat grid
          expect(sourceBeatGridFrames).toContain(sourceFrame);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no source beats within the trimmed range are missing from the result', () => {
    fc.assert(
      fc.property(virtualClipWithBeatsArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        const { absoluteStart, absoluteEnd } = getAbsoluteRange(clip);

        // Find all source beats that should be in range
        const expectedBeats = sourceBeatGridFrames.filter(
          (frame) => frame >= absoluteStart && frame < absoluteEnd,
        );

        expect(result.length).toBe(expectedBeats.length);
      }),
      { numRuns: 100 },
    );
  });

  it('if no beats fall within range, result is empty', () => {
    // Use a clip where the beat grid is entirely outside the trimmed range
    const emptyRangeArb = fc
      .record({
        fromFrame: fc.integer({ min: 1000, max: 5000 }),
        durationInFrames: fc.integer({ min: 30, max: 300 }),
        fps: fc.constantFrom(24, 30, 60),
      })
      .map(({ fromFrame, durationInFrames, fps }) => {
        const clip: VirtualClipDef = {
          clipId: 'test_clip_001_008',
          sourceId: 'test_source',
          status: 'draft' as const,
          remotion: { fromFrame, durationInFrames, fps },
          beatMarkerFrames: [],
          cycleNumber: 1,
          beatCount: 8,
          inPoint: 0,
          outPoint: durationInFrames / fps,
        };
        // All beats are before the clip's absolute start
        const sourceBeatGridFrames = Array.from(
          { length: 10 },
          (_, i) => i * 5,
        ).filter((f) => f < fromFrame);
        return { clip, sourceBeatGridFrames };
      });

    fc.assert(
      fc.property(emptyRangeArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        expect(result).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('each marker equals sourceBeat - (fromFrame + inPointFrame)', () => {
    fc.assert(
      fc.property(virtualClipWithBeatsArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        const { absoluteStart, absoluteEnd } = getAbsoluteRange(clip);

        // Get expected beats in range
        const beatsInRange = sourceBeatGridFrames.filter(
          (frame) => frame >= absoluteStart && frame < absoluteEnd,
        );

        // Each marker should equal sourceBeat - absoluteStart
        // where absoluteStart = fromFrame + inPointFrame
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBe(beatsInRange[i] - absoluteStart);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('works correctly when no trim points are set (defaults to full clip range)', () => {
    fc.assert(
      fc.property(virtualClipNoTrimArb, ({ clip, sourceBeatGridFrames }) => {
        const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
        const { fromFrame, durationInFrames } = clip.remotion;

        // With no trim points, range is [fromFrame, fromFrame + durationInFrames)
        const absoluteStart = fromFrame;
        const absoluteEnd = fromFrame + durationInFrames;

        const expectedBeats = sourceBeatGridFrames.filter(
          (frame) => frame >= absoluteStart && frame < absoluteEnd,
        );

        expect(result.length).toBe(expectedBeats.length);

        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBe(expectedBeats[i] - absoluteStart);
          expect(result[i]).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
