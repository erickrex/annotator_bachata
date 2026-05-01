// Feature: clip-slicer-annotator, Property 15: Annotation Completeness Calculation
// **Validates: Requirements 13.6**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService, TOTAL_REQUIRED_FIELDS } from '../../services/annotation-service.js';
import type { ClipAnnotation } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Required field dot-paths (must match annotation-service.ts REQUIRED_FIELDS)
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
// Helpers
// ---------------------------------------------------------------------------

function makeValidClip(): ClipAnnotation {
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
  };
}

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

// Generator: pick a random subset of required fields to empty
const fieldsToEmptyArb = fc.subarray([...REQUIRED_FIELDS], { minLength: 0 });

describe('Property 15: Annotation Completeness Calculation', () => {
  it('completeness equals filled required fields / total required fields', () => {
    fc.assert(
      fc.property(fieldsToEmptyArb, (fieldsToEmpty) => {
        const svc = createAnnotationService('Test');
        const clip = makeValidClip();
        const obj = clip as unknown as Record<string, unknown>;

        // Empty the selected fields
        for (const field of fieldsToEmpty) {
          setNestedValue(obj, field, '');
        }

        const completeness = svc.calculateCompleteness(clip);
        const expectedFilled = TOTAL_REQUIRED_FIELDS - fieldsToEmpty.length;
        const expectedCompleteness = expectedFilled / TOTAL_REQUIRED_FIELDS;

        expect(completeness).toBeCloseTo(expectedCompleteness, 10);
      }),
      { numRuns: 100 },
    );
  });
});
