// Feature: clip-slicer-annotator, Property 24: Export Schema Conformance
// **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.6, 18.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService } from '../../services/annotation-service.js';
import type { ClipAnnotation, SourceRecord } from '../../types/index.js';
import { DEFAULT_ENUM_DEFINITIONS } from '../../types/enums.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    source_id: 'src1',
    youtube_url: 'https://youtube.com/watch?v=abc123',
    title: 'Test Video',
    channel: 'Test Channel',
    upload_date: '2024-01-01',
    duration_seconds: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    total_frames: 3600,
    video_file: 'sources/src1.mp4',
    audio_file: 'sources/src1.wav',
    detected_bpm: 130,
    bpm_confidence: 0.95,
    downbeat_offset_seconds: 0.1,
    beat_grid: [0.1],
    beat_grid_frames: [3],
    energy_profile: [0.5],
    downloaded_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeValidClip(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
  return {
    clip_id: 'src1_c001_008',
    source_id: 'src1',
    status: 'reviewed',
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

// Required top-level keys in the export
const REQUIRED_TOP_LEVEL_KEYS = [
  'schema_version',
  'project',
  'sources',
  'enum_definitions',
  'clips',
];

// Required fields in each source record
const REQUIRED_SOURCE_FIELDS = [
  'source_id',
  'youtube_url',
  'title',
  'channel',
  'upload_date',
  'duration_seconds',
  'fps',
  'width',
  'height',
  'total_frames',
  'video_file',
  'audio_file',
  'detected_bpm',
  'bpm_confidence',
  'downbeat_offset_seconds',
  'beat_grid',
  'beat_grid_frames',
  'energy_profile',
  'downloaded_at',
];

// Required fields in each clip record
const REQUIRED_CLIP_FIELDS = [
  'clip_id',
  'source_id',
  'status',
  'remotion',
  'move_name',
  'move_label',
  'tags',
  'difficulty',
  'energy_level',
  'style',
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
];

// All enum definition keys
const ENUM_DEFINITION_KEYS = Object.keys(DEFAULT_ENUM_DEFINITIONS);

// Generator: random number of sources (1-3) and clips per source (0-3)
const projectShapeArb = fc.record({
  sourceCount: fc.integer({ min: 1, max: 3 }),
  clipsPerSource: fc.integer({ min: 0, max: 3 }),
  projectName: fc.string({ minLength: 1, maxLength: 30 }),
});

describe('Property 24: Export Schema Conformance', () => {
  it('exported project conforms to schema v2.0 structure', () => {
    fc.assert(
      fc.property(projectShapeArb, ({ sourceCount, clipsPerSource, projectName }) => {
        const svc = createAnnotationService(projectName);

        // Add sources and clips
        for (let s = 0; s < sourceCount; s++) {
          const sourceId = `src${s + 1}`;
          svc.addSource(makeSource({ source_id: sourceId }));

          for (let c = 0; c < clipsPerSource; c++) {
            const clipId = `${sourceId}_c${String(c + 1).padStart(3, '0')}_008`;
            svc.updateAnnotation(
              clipId,
              makeValidClip({ clip_id: clipId, source_id: sourceId }),
            );
          }
        }

        const exported = svc.exportProject();
        const json = exported as unknown as Record<string, unknown>;

        // (a) schema_version is "2.0"
        expect(exported.schema_version).toBe('2.0');

        // (b) top-level keys present
        for (const key of REQUIRED_TOP_LEVEL_KEYS) {
          expect(json).toHaveProperty(key);
        }

        // (c) each source record has all required fields
        for (const source of exported.sources) {
          const srcObj = source as unknown as Record<string, unknown>;
          for (const field of REQUIRED_SOURCE_FIELDS) {
            expect(srcObj).toHaveProperty(field);
          }
        }

        // (d) each clip record has all required fields
        for (const clip of exported.clips) {
          const clipObj = clip as unknown as Record<string, unknown>;
          for (const field of REQUIRED_CLIP_FIELDS) {
            expect(clipObj).toHaveProperty(field);
          }
        }

        // (e) enum_definitions contains all controlled vocabulary keys
        const enumDefs = exported.enum_definitions as Record<string, unknown>;
        for (const key of ENUM_DEFINITION_KEYS) {
          expect(enumDefs).toHaveProperty(key);
          expect(Array.isArray(enumDefs[key])).toBe(true);
          expect((enumDefs[key] as unknown[]).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
