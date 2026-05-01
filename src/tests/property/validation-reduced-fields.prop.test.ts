// Feature: codebase-cleanup, Property 3: Validation checks reduced required fields only
// **Validates: Requirements 4.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Reduced required fields — the ONLY fields that may appear in validation errors
// ---------------------------------------------------------------------------

const ALLOWED_ERROR_FIELDS = new Set([
  'clip_id',
  'source_id',
  'status',
  'remotion.from_frame',
  'remotion.duration_in_frames',
  'remotion.fps',
  'move_name',
  'difficulty',
  'style',
  'tags',
]);

// ---------------------------------------------------------------------------
// Optional fields — these must NEVER appear in validation errors
// ---------------------------------------------------------------------------

const OPTIONAL_FIELDS = [
  'move_label',
  'move_family',
  'move_variant',
  'energy_level',
  'estimated_tempo_bpm',
  'duration_seconds',
  'beats_total',
  'bars_total',
  'phrase_resolution',
  'song_position',
  'entry_state',
  'exit_state',
  'trim_profile',
  'motion_profile',
  'camera_profile',
  'quality_profile',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_IDS = new Set<string>();
const TOTAL_FRAMES = 100000;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid base ClipAnnotation with all required fields populated. */
function validClipArb(): fc.Arbitrary<ClipAnnotation> {
  return fc.record({
    clip_id: fc.string({ minLength: 1, maxLength: 30 }),
    source_id: fc.string({ minLength: 1, maxLength: 20 }),
    status: fc.constantFrom('pending', 'discarded', 'reviewed', 'in_progress', 'annotated') as fc.Arbitrary<ClipAnnotation['status']>,
    remotion: fc.record({
      from_frame: fc.integer({ min: 0, max: 5000 }),
      duration_in_frames: fc.integer({ min: 1, max: 5000 }),
      fps: fc.constantFrom(24, 25, 30, 60),
    }),
    move_name: fc.string({ minLength: 1, maxLength: 30 }),
    difficulty: fc.constantFrom('beginner', 'intermediate', 'advanced') as fc.Arbitrary<ClipAnnotation['difficulty']>,
    style: fc.constantFrom('traditional', 'sensual', 'moderna', 'fusion') as fc.Arbitrary<ClipAnnotation['style']>,
    tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 0, maxLength: 5 }),
  });
}

/** Generate random optional field values to attach to a clip. */
function optionalFieldsArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record(
    {
      move_label: fc.oneof(
        fc.constantFrom('basic', 'spin', 'headrolls', 'bodywaves'),
        fc.string({ minLength: 1, maxLength: 10 }), // possibly invalid value
      ),
      move_family: fc.string({ minLength: 0, maxLength: 20 }),
      move_variant: fc.string({ minLength: 0, maxLength: 20 }),
      energy_level: fc.oneof(
        fc.constantFrom('low', 'medium', 'high'),
        fc.string({ minLength: 1, maxLength: 10 }), // possibly invalid value
      ),
      estimated_tempo_bpm: fc.oneof(fc.integer({ min: -100, max: 300 }), fc.double({ min: -50, max: 200, noNaN: true })),
      duration_seconds: fc.oneof(fc.double({ min: -10, max: 120, noNaN: true }), fc.integer({ min: -5, max: 60 })),
      beats_total: fc.oneof(fc.integer({ min: -10, max: 64 }), fc.double({ min: 0, max: 32, noNaN: true })),
      bars_total: fc.oneof(fc.integer({ min: -5, max: 16 }), fc.double({ min: 0, max: 8, noNaN: true })),
      phrase_resolution: fc.oneof(
        fc.constantFrom('4_count', '8_count', '16_count', 'irregular'),
        fc.string({ minLength: 1, maxLength: 10 }),
      ),
      entry_state: fc.record({
        hold: fc.constantFrom('open', 'closed', 'shadow'),
        leader_weight_foot: fc.constantFrom('left', 'right'),
        follower_weight_foot: fc.constantFrom('left', 'right'),
      }),
      exit_state: fc.record({
        hold: fc.constantFrom('open', 'closed', 'shadow'),
        leader_weight_foot: fc.constantFrom('left', 'right'),
        follower_weight_foot: fc.constantFrom('left', 'right'),
      }),
      trim_profile: fc.record({
        trim_safe_start_seconds: fc.double({ min: 0, max: 10, noNaN: true }),
        trim_safe_end_seconds: fc.double({ min: 10, max: 60, noNaN: true }),
      }),
      motion_profile: fc.record({
        travel_amount: fc.constantFrom('none', 'low', 'medium', 'high'),
        spin_count: fc.integer({ min: -5, max: 10 }),
      }),
      camera_profile: fc.record({
        camera_angle: fc.constantFrom('front', 'side', 'back'),
        visibility_score: fc.double({ min: -1, max: 2, noNaN: true }),
      }),
      quality_profile: fc.record({
        visibility_score: fc.double({ min: -1, max: 2, noNaN: true }),
        boundary_cleanliness: fc.double({ min: -1, max: 2, noNaN: true }),
      }),
    },
    { requiredKeys: [] }, // all optional — random subset will be included
  );
}

/**
 * Generate a ClipAnnotation that may have some required fields missing/invalid
 * and various optional fields populated with both valid and invalid values.
 */
function clipWithVariationsArb(): fc.Arbitrary<ClipAnnotation> {
  return fc.tuple(validClipArb(), optionalFieldsArb(), fc.boolean()).map(([base, optionals, corruptRequired]) => {
    const clip = { ...base, ...optionals } as unknown as ClipAnnotation;

    // Optionally corrupt some required fields to trigger validation errors
    if (corruptRequired) {
      const obj = clip as unknown as Record<string, unknown>;
      // Randomly remove or invalidate a required field
      const fieldToCorrupt = fc.sample(
        fc.constantFrom('clip_id', 'source_id', 'move_name', 'status', 'difficulty', 'style', 'tags'),
        1,
      )[0];
      if (fieldToCorrupt === 'tags') {
        obj['tags'] = 'not_an_array'; // invalid type
      } else if (fieldToCorrupt === 'status') {
        obj['status'] = 'invalid_status_xyz';
      } else if (fieldToCorrupt === 'difficulty') {
        obj['difficulty'] = 'impossible';
      } else if (fieldToCorrupt === 'style') {
        obj['style'] = 'nonexistent_style';
      } else {
        obj[fieldToCorrupt] = ''; // empty string triggers required error
      }
    }

    return clip;
  });
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: codebase-cleanup, Property 3: Validation checks reduced required fields only', () => {
  it('all validation errors reference only fields in the reduced required set', () => {
    fc.assert(
      fc.property(clipWithVariationsArb(), (clip) => {
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);

        // Every error's field must be in the allowed set
        for (const error of errors) {
          expect(ALLOWED_ERROR_FIELDS.has(error.field)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no validation error references optional fields', () => {
    fc.assert(
      fc.property(clipWithVariationsArb(), (clip) => {
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);

        // No error should reference any optional field
        for (const error of errors) {
          for (const optField of OPTIONAL_FIELDS) {
            expect(error.field).not.toBe(optField);
            // Also check nested optional paths like entry_state.hold
            expect(error.field.startsWith(`${optField}.`)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('validation with fully valid clip and random optional fields produces no errors', () => {
    fc.assert(
      fc.property(validClipArb(), optionalFieldsArb(), (baseClip, optionals) => {
        const clip = { ...baseClip, ...optionals } as unknown as ClipAnnotation;
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);

        // All required fields are valid, so no errors should be produced
        // (regardless of what optional fields contain)
        expect(errors.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
