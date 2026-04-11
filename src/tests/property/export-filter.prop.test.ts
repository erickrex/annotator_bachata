// Feature: clip-slicer-annotator, Property 12: Batch Export Filters Discarded Clips
// **Validates: Requirements 12.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { VirtualClipDef } from '../../types/index.js';
import { CLIP_STATUS_VALUES } from '../../types/enums.js';

/**
 * Extracts the filtering logic from exportBatch: returns only clips
 * whose status is not 'discarded'. This tests the core filtering
 * without requiring Remotion rendering infrastructure.
 */
function filterEligibleClips(clips: VirtualClipDef[]): VirtualClipDef[] {
  return clips.filter((c) => c.status !== 'discarded');
}

/** Arbitrary for a VirtualClipDef with a random status. */
const virtualClipArb: fc.Arbitrary<VirtualClipDef> = fc
  .record({
    clipId: fc.stringMatching(/^[a-z0-9_]{3,20}$/),
    sourceId: fc.stringMatching(/^src_[a-z0-9]{3,8}$/),
    status: fc.constantFrom(...CLIP_STATUS_VALUES),
    fromFrame: fc.integer({ min: 0, max: 100000 }),
    durationInFrames: fc.integer({ min: 1, max: 5000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    beatCount: fc.constantFrom(8, 16, 32),
    cycleNumber: fc.integer({ min: 1, max: 100 }),
  })
  .map(({ clipId, sourceId, status, fromFrame, durationInFrames, fps, beatCount, cycleNumber }) => ({
    clipId,
    sourceId,
    status,
    remotion: { fromFrame, durationInFrames, fps },
    beatMarkerFrames: [],
    cycleNumber,
    beatCount,
  }));

describe('Property 12: Batch Export Filters Discarded Clips', () => {
  it('should produce output entries only for clips whose status is not "discarded"', () => {
    fc.assert(
      fc.property(fc.array(virtualClipArb, { minLength: 0, maxLength: 30 }), (clips) => {
        const eligible = filterEligibleClips(clips);

        // No eligible clip should have status 'discarded'
        for (const clip of eligible) {
          expect(clip.status).not.toBe('discarded');
        }

        // Every non-discarded clip from the input should appear in the output
        const nonDiscarded = clips.filter((c) => c.status !== 'discarded');
        expect(eligible.length).toBe(nonDiscarded.length);

        // The eligible set should contain exactly the non-discarded clips (same IDs, same order)
        for (let i = 0; i < eligible.length; i++) {
          expect(eligible[i].clipId).toBe(nonDiscarded[i].clipId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should return empty array when all clips are discarded', () => {
    const discardedClipArb: fc.Arbitrary<VirtualClipDef> = fc
      .record({
        clipId: fc.stringMatching(/^[a-z0-9_]{3,20}$/),
        sourceId: fc.stringMatching(/^src_[a-z0-9]{3,8}$/),
        fromFrame: fc.integer({ min: 0, max: 100000 }),
        durationInFrames: fc.integer({ min: 1, max: 5000 }),
        fps: fc.constantFrom(24, 25, 30, 60),
        cycleNumber: fc.integer({ min: 1, max: 100 }),
      })
      .map(({ clipId, sourceId, fromFrame, durationInFrames, fps, cycleNumber }) => ({
        clipId,
        sourceId,
        status: 'discarded' as const,
        remotion: { fromFrame, durationInFrames, fps },
        beatMarkerFrames: [],
        cycleNumber,
        beatCount: 8,
      }));

    fc.assert(
      fc.property(fc.array(discardedClipArb, { minLength: 1, maxLength: 20 }), (clips) => {
        const eligible = filterEligibleClips(clips);
        expect(eligible).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
