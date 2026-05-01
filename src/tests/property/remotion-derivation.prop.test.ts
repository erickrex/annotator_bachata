// Feature: codebase-cleanup, Property 6: ClipAnnotation.remotion derived from VirtualClipDef at serialization
// **Validates: Requirements 9.2, 9.3**

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { resetAppState, getAppState, upsertClip, getFullProjectState } from '../../services/app-state.js';
import type { VirtualClipDef } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a random VirtualClipDef with varying timing values.
 * Constrains values to realistic ranges for frame-based video data.
 */
function arbitraryVirtualClipDef(): fc.Arbitrary<VirtualClipDef> {
  return fc.record({
    clipId: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `clip_${s.replace(/[^a-zA-Z0-9_]/g, 'x')}`),
    sourceId: fc.constantFrom('src1', 'src2', 'src3'),
    status: fc.constantFrom('pending' as const, 'in_progress' as const, 'annotated' as const),
    remotion: fc.record({
      fromFrame: fc.integer({ min: 0, max: 100000 }),
      durationInFrames: fc.integer({ min: 1, max: 10000 }),
      fps: fc.constantFrom(24, 25, 30, 48, 50, 60),
    }),
    beatMarkerFrames: fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 0, maxLength: 20 }),
    cycleNumber: fc.integer({ min: 1, max: 100 }),
    beatCount: fc.constantFrom(4, 8, 16),
  });
}

/**
 * Generate a list of 1-5 unique VirtualClipDefs to add to state.
 */
function arbitraryClipList(): fc.Arbitrary<VirtualClipDef[]> {
  return fc.array(arbitraryVirtualClipDef(), { minLength: 1, maxLength: 5 }).map((clips) => {
    // Ensure unique clipIds
    const seen = new Set<string>();
    return clips.filter((c) => {
      if (seen.has(c.clipId)) return false;
      seen.add(c.clipId);
      return true;
    });
  }).filter((clips) => clips.length > 0);
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: codebase-cleanup, Property 6: ClipAnnotation.remotion derived from VirtualClipDef at serialization', () => {
  beforeEach(() => {
    resetAppState();
  });

  it('serialized ClipAnnotation.remotion matches VirtualClipDef timing fields (camelCase → snake_case)', () => {
    fc.assert(
      fc.property(arbitraryClipList(), (clips) => {
        // Reset state for each iteration
        resetAppState();

        // Add clips to app state via upsertClip
        for (const clip of clips) {
          upsertClip(clip);
        }

        // Serialize via getFullProjectState
        const projectState = getFullProjectState();

        // For each VirtualClipDef, verify the corresponding ClipAnnotation.remotion
        for (const clip of clips) {
          const annotation = projectState.clips.find((a) => a.clip_id === clip.clipId);

          // The annotation must exist
          expect(annotation).toBeDefined();

          // The remotion fields must be derived from VirtualClipDef
          expect(annotation!.remotion.from_frame).toBe(clip.remotion.fromFrame);
          expect(annotation!.remotion.duration_in_frames).toBe(clip.remotion.durationInFrames);
          expect(annotation!.remotion.fps).toBe(clip.remotion.fps);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('updating VirtualClipDef timing and re-serializing reflects the new values', () => {
    fc.assert(
      fc.property(
        arbitraryVirtualClipDef(),
        fc.record({
          fromFrame: fc.integer({ min: 0, max: 100000 }),
          durationInFrames: fc.integer({ min: 1, max: 10000 }),
          fps: fc.constantFrom(24, 25, 30, 48, 50, 60),
        }),
        (clip, newTiming) => {
          // Reset state for each iteration
          resetAppState();

          // Add initial clip
          upsertClip(clip);

          // Update the clip with new timing
          const updatedClip: VirtualClipDef = {
            ...clip,
            remotion: newTiming,
          };
          upsertClip(updatedClip);

          // Serialize
          const projectState = getFullProjectState();
          const annotation = projectState.clips.find((a) => a.clip_id === clip.clipId);

          // The annotation must reflect the UPDATED timing, not the original
          expect(annotation).toBeDefined();
          expect(annotation!.remotion.from_frame).toBe(newTiming.fromFrame);
          expect(annotation!.remotion.duration_in_frames).toBe(newTiming.durationInFrames);
          expect(annotation!.remotion.fps).toBe(newTiming.fps);
        },
      ),
      { numRuns: 100 },
    );
  });
});
