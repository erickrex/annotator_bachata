// Feature: codebase-cleanup, Property 2: Annotation completeness uses reduced field set only
// **Validates: Requirements 4.1, 4.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService, TOTAL_REQUIRED_FIELDS } from '../../services/annotation-service.js';
import type { ClipAnnotation } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Required fields — the 10 dot-paths that determine completeness
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
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
] as const;

// ---------------------------------------------------------------------------
// Optional fields — these should NEVER affect completeness
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

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function clearNestedValue(obj: Record<string, unknown>, dotPath: string): void {
  setNestedValue(obj, dotPath, '');
}

function makeFullAnnotation(): ClipAnnotation {
  return {
    clip_id: 'src1_c001_008',
    source_id: 'src1',
    status: 'annotated',
    remotion: { from_frame: 120, duration_in_frames: 900, fps: 30 },
    move_name: 'basic step',
    difficulty: 'beginner',
    style: 'traditional',
    tags: ['basic', 'lead'],
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Generator: pick a random subset of required fields to empty
const fieldsToEmptyArb = fc.subarray([...REQUIRED_FIELDS], { minLength: 0 });

// Generator: pick a random subset of optional fields to add
const optionalFieldsToAddArb = fc.subarray([...OPTIONAL_FIELDS], { minLength: 0 });

// Generator: random optional field values
function arbitraryOptionalValue(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.integer({ min: 1, max: 300 }),
    fc.double({ min: 0.1, max: 100, noNaN: true }),
    fc.record({
      hold: fc.constantFrom('open', 'closed', 'shadow'),
      leader_weight_foot: fc.constantFrom('left', 'right'),
      follower_weight_foot: fc.constantFrom('left', 'right'),
    }),
    fc.record({
      trim_safe_start_seconds: fc.double({ min: 0, max: 10, noNaN: true }),
      trim_safe_end_seconds: fc.double({ min: 10, max: 60, noNaN: true }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: codebase-cleanup, Property 2: Annotation completeness uses reduced field set only', () => {
  it('completeness equals filled required fields / total required fields (10 fields)', () => {
    fc.assert(
      fc.property(fieldsToEmptyArb, (fieldsToEmpty) => {
        const svc = createAnnotationService('Test');
        const clip = makeFullAnnotation();
        const obj = clip as unknown as Record<string, unknown>;

        // Empty the selected required fields
        for (const field of fieldsToEmpty) {
          clearNestedValue(obj, field);
        }

        const completeness = svc.calculateCompleteness(clip);
        const expectedFilled = REQUIRED_FIELDS.length - fieldsToEmpty.length;
        const expectedCompleteness = expectedFilled / TOTAL_REQUIRED_FIELDS;

        expect(completeness).toBeCloseTo(expectedCompleteness, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('adding optional fields does not change the completeness score', () => {
    fc.assert(
      fc.property(
        optionalFieldsToAddArb,
        arbitraryOptionalValue(),
        (fieldsToAdd, value) => {
          const svc = createAnnotationService('Test');

          // Baseline: full annotation with all required fields filled
          const baseClip = makeFullAnnotation();
          const baseScore = svc.calculateCompleteness(baseClip);

          // Add random optional fields
          const augmentedClip = { ...baseClip } as unknown as Record<string, unknown>;
          for (const field of fieldsToAdd) {
            augmentedClip[field] = value;
          }

          const augmentedScore = svc.calculateCompleteness(
            augmentedClip as unknown as ClipAnnotation,
          );

          // Score must remain unchanged
          expect(augmentedScore).toBe(baseScore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('removing optional fields does not change the completeness score', () => {
    fc.assert(
      fc.property(optionalFieldsToAddArb, (fieldsToRemove) => {
        const svc = createAnnotationService('Test');

        // Start with a clip that has all optional fields populated
        const clip: Record<string, unknown> = {
          ...makeFullAnnotation(),
          move_label: 'basic',
          move_family: 'basics',
          move_variant: 'standard',
          energy_level: 'medium',
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
          motion_profile: { travel_amount: 'low' },
          camera_profile: { camera_angle: 'front' },
          quality_profile: { visibility_score: 0.9 },
        };

        const baseScore = svc.calculateCompleteness(clip as unknown as ClipAnnotation);

        // Remove selected optional fields
        for (const field of fieldsToRemove) {
          delete clip[field];
        }

        const reducedScore = svc.calculateCompleteness(clip as unknown as ClipAnnotation);

        // Score must remain unchanged
        expect(reducedScore).toBe(baseScore);
      }),
      { numRuns: 100 },
    );
  });

  it('TOTAL_REQUIRED_FIELDS equals 10', () => {
    expect(TOTAL_REQUIRED_FIELDS).toBe(10);
  });
});
