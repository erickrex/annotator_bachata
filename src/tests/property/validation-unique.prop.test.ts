// Feature: clip-slicer-annotator, Property 21: Clip ID Uniqueness Validation
// **Validates: Requirements 14.12**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function makeValidClip(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
  return {
    clip_id: 'src1_c001_008',
    source_id: 'src1',
    status: 'annotated',
    remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
    move_name: 'basic step',
    move_label: 'basic',
    tags: [],
    difficulty: 'beginner',
    energy_level: 'medium',
    style: 'traditional',
    estimated_tempo_bpm: 130,
    duration_seconds: 30,
    beats_total: 8,
    bars_total: 2,
    phrase_resolution: '8_count',
    song_position: {
      start_time_seconds: 0,
      end_time_seconds: 30,
      cycle_number: 1,
      beat_start: 1,
      beat_end: 8,
    },
    entry_state: {
      hold: 'closed',
      leader_weight_foot: 'left',
      follower_weight_foot: 'right',
    },
    exit_state: {
      hold: 'closed',
      leader_weight_foot: 'right',
      follower_weight_foot: 'left',
    },
    trim_profile: {
      trim_safe_start_seconds: 0,
      trim_safe_end_seconds: 30,
    },
    motion_profile: {},
    camera_profile: {},
    quality_profile: {},
    ...overrides,
  };
}

const TOTAL_FRAMES = 10000;

describe('Property 21: Clip ID Uniqueness Validation', () => {
  it('unique clip_id produces no uniqueness error', () => {
    const clip = makeValidClip({ clip_id: 'unique_id_123' });
    const existingIds = new Set(['other_id_1', 'other_id_2']);
    const errors = validateClip(clip, existingIds, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'unique_clip_id')).toHaveLength(0);
  });

  it('for any set of clips with duplicate IDs, each duplicate is flagged', () => {
    // Generate a list of clip IDs where at least some are duplicated
    const clipIdsArb = fc
      .array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 10 })
      .chain((ids) => {
        // Force at least one duplicate by repeating a random element
        return fc.integer({ min: 0, max: ids.length - 1 }).map((dupIdx) => {
          const duplicated = [...ids, ids[dupIdx]];
          return duplicated;
        });
      });

    fc.assert(
      fc.property(clipIdsArb, (clipIds) => {
        // Simulate validating each clip against the set of previously-seen IDs
        const seenIds = new Set<string>();
        let totalDuplicateErrors = 0;
        let expectedDuplicates = 0;

        for (const id of clipIds) {
          const clip = makeValidClip({ clip_id: id });
          const errors = validateClip(clip, seenIds, TOTAL_FRAMES);
          const dupErrors = errors.filter((e) => e.rule === 'unique_clip_id');

          if (seenIds.has(id)) {
            // This is a duplicate — should produce an error
            expectedDuplicates++;
            totalDuplicateErrors += dupErrors.length;
            expect(dupErrors.length).toBeGreaterThanOrEqual(1);
          }

          seenIds.add(id);
        }

        // Every expected duplicate should have been caught
        expect(totalDuplicateErrors).toBeGreaterThanOrEqual(expectedDuplicates);
      }),
      { numRuns: 100 },
    );
  });
});
