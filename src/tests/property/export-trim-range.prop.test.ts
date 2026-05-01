// Feature: codebase-cleanup, Property 1: Export trim range computation
// **Validates: Requirements 2.1, 2.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeTrimRange } from '../../services/export-service.js';
import type { VirtualClipDef } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a VirtualClipDef with both inPoint and outPoint set.
 * Ensures outPoint > inPoint for a valid trim range.
 */
const clipWithBothTrimPointsArb = fc
  .record({
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    handleBefore: fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
    inPointFraction: fc.float({ min: 0, max: Math.fround(0.8), noNaN: true, noDefaultInfinity: true }),
    outPointFraction: fc.float({ min: Math.fround(0.2), max: 1, noNaN: true, noDefaultInfinity: true }),
  })
  .filter(({ inPointFraction, outPointFraction }) => inPointFraction < outPointFraction)
  .map(({ fromFrame, durationInFrames, fps, handleBefore, inPointFraction, outPointFraction }) => {
    const clipDuration = durationInFrames / fps;
    const totalDuration = handleBefore + clipDuration;
    const inPoint = inPointFraction * totalDuration;
    const outPoint = outPointFraction * totalDuration;

    const clip: VirtualClipDef = {
      clipId: 'test_clip_001_008',
      sourceId: 'test_source',
      status: 'draft' as const,
      remotion: { fromFrame, durationInFrames, fps },
      beatMarkerFrames: [],
      cycleNumber: 1,
      beatCount: 8,
      extractedFile: 'sources/clips/test/test_clip.mp4',
      handleBefore,
      inPoint,
      outPoint,
    };
    return clip;
  });

/**
 * Generate a VirtualClipDef with NO trim points (inPoint and outPoint undefined).
 * Should fall back to handleBefore-based defaults.
 */
const clipWithNoTrimPointsArb = fc
  .record({
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    handleBefore: fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ fromFrame, durationInFrames, fps, handleBefore }) => {
    const clip: VirtualClipDef = {
      clipId: 'test_clip_002_008',
      sourceId: 'test_source',
      status: 'draft' as const,
      remotion: { fromFrame, durationInFrames, fps },
      beatMarkerFrames: [],
      cycleNumber: 1,
      beatCount: 8,
      extractedFile: 'sources/clips/test/test_clip.mp4',
      handleBefore,
    };
    return clip;
  });

/**
 * Generate a VirtualClipDef with only inPoint set (outPoint undefined).
 */
const clipWithOnlyInPointArb = fc
  .record({
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    handleBefore: fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
    inPointFraction: fc.float({ min: 0, max: Math.fround(0.5), noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ fromFrame, durationInFrames, fps, handleBefore, inPointFraction }) => {
    const clipDuration = durationInFrames / fps;
    const totalDuration = handleBefore + clipDuration;
    const inPoint = inPointFraction * totalDuration;

    const clip: VirtualClipDef = {
      clipId: 'test_clip_003_008',
      sourceId: 'test_source',
      status: 'draft' as const,
      remotion: { fromFrame, durationInFrames, fps },
      beatMarkerFrames: [],
      cycleNumber: 1,
      beatCount: 8,
      extractedFile: 'sources/clips/test/test_clip.mp4',
      handleBefore,
      inPoint,
    };
    return clip;
  });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 1: Export trim range computation', () => {
  it('seekPosition equals inPoint when inPoint is set', () => {
    fc.assert(
      fc.property(clipWithBothTrimPointsArb, (clip) => {
        const { seekPosition } = computeTrimRange(clip);
        expect(seekPosition).toBe(clip.inPoint);
      }),
      { numRuns: 100 },
    );
  });

  it('seekPosition equals handleBefore when inPoint is not set', () => {
    fc.assert(
      fc.property(clipWithNoTrimPointsArb, (clip) => {
        const { seekPosition } = computeTrimRange(clip);
        expect(seekPosition).toBe(clip.handleBefore ?? 0);
      }),
      { numRuns: 100 },
    );
  });

  it('duration equals outPoint - seekPosition when both trim points are set', () => {
    fc.assert(
      fc.property(clipWithBothTrimPointsArb, (clip) => {
        const { seekPosition, duration } = computeTrimRange(clip);
        const expectedDuration = clip.outPoint! - seekPosition;
        expect(duration).toBeCloseTo(expectedDuration, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('duration equals (handleBefore + clipDuration) - seekPosition when outPoint is not set', () => {
    fc.assert(
      fc.property(clipWithNoTrimPointsArb, (clip) => {
        const { seekPosition, duration } = computeTrimRange(clip);
        const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
        const handleBefore = clip.handleBefore ?? 0;
        const expectedOutPoint = handleBefore + clipDuration;
        const expectedDuration = expectedOutPoint - seekPosition;
        expect(duration).toBeCloseTo(expectedDuration, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('duration is always positive', () => {
    fc.assert(
      fc.property(clipWithBothTrimPointsArb, (clip) => {
        const { duration } = computeTrimRange(clip);
        expect(duration).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('duration is always positive when no trim points are set', () => {
    fc.assert(
      fc.property(clipWithNoTrimPointsArb, (clip) => {
        const { duration } = computeTrimRange(clip);
        expect(duration).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('seekPosition + duration equals outPoint when outPoint is set', () => {
    fc.assert(
      fc.property(clipWithBothTrimPointsArb, (clip) => {
        const { seekPosition, duration } = computeTrimRange(clip);
        expect(seekPosition + duration).toBeCloseTo(clip.outPoint!, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('seekPosition + duration equals (handleBefore + clipDuration) when outPoint is not set', () => {
    fc.assert(
      fc.property(clipWithNoTrimPointsArb, (clip) => {
        const { seekPosition, duration } = computeTrimRange(clip);
        const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
        const handleBefore = clip.handleBefore ?? 0;
        expect(seekPosition + duration).toBeCloseTo(handleBefore + clipDuration, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('seekPosition equals inPoint and duration covers to default outPoint when only inPoint is set', () => {
    fc.assert(
      fc.property(clipWithOnlyInPointArb, (clip) => {
        const { seekPosition, duration } = computeTrimRange(clip);
        const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
        const handleBefore = clip.handleBefore ?? 0;
        const expectedOutPoint = handleBefore + clipDuration;

        expect(seekPosition).toBe(clip.inPoint);
        expect(seekPosition + duration).toBeCloseTo(expectedOutPoint, 10);
        expect(duration).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
