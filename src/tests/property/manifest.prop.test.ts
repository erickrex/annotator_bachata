// Feature: clip-slicer-annotator, Property 16: Manifest Consistency
// **Validates: Requirements 13.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeManifest } from '../../services/project-service.js';
import type { AnnotationProjectFile, ClipAnnotation, SourceRecord } from '../../types/index.js';
import { CLIP_STATUS_VALUES, DEFAULT_ENUM_DEFINITIONS } from '../../types/enums.js';
import type { ClipStatus } from '../../types/enums.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary ClipStatus from the controlled vocabulary. */
const clipStatusArb: fc.Arbitrary<ClipStatus> = fc.constantFrom(...CLIP_STATUS_VALUES);

/** Minimal ClipAnnotation with a given source_id and status. */
function clipArb(clipIndex: number, sourceId: string, status: ClipStatus): ClipAnnotation {
  return {
    clip_id: `${sourceId}_c${String(clipIndex).padStart(3, '0')}_008`,
    source_id: sourceId,
    status,
    remotion: { from_frame: clipIndex * 240, duration_in_frames: 240, fps: 30 },
    move_name: 'basic',
    move_label: 'basic',
    tags: [],
    difficulty: 'beginner',
    energy_level: 'medium',
    style: 'traditional',
    estimated_tempo_bpm: 130,
    duration_seconds: 8,
    beats_total: 8,
    bars_total: 2,
    phrase_resolution: '8_count',
    song_position: {
      start_time_seconds: clipIndex * 8,
      end_time_seconds: (clipIndex + 1) * 8,
      cycle_number: clipIndex + 1,
      beat_start: 1,
      beat_end: 8,
    },
    entry_state: { hold: 'closed', leader_weight_foot: 'left', follower_weight_foot: 'right' },
    exit_state: { hold: 'closed', leader_weight_foot: 'right', follower_weight_foot: 'left' },
    trim_profile: { trim_safe_start_seconds: 0, trim_safe_end_seconds: 8 },
    motion_profile: {},
    camera_profile: {},
    quality_profile: {},
  };
}

/**
 * Generate a random project file with 0–5 sources and 0–8 clips per source,
 * each clip assigned a random status.
 */
const projectFileArb: fc.Arbitrary<AnnotationProjectFile> = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }), // number of sources
    fc.array(fc.integer({ min: 0, max: 8 }), { minLength: 5, maxLength: 5 }), // clips per source
    fc.array(clipStatusArb, { minLength: 40, maxLength: 40 }), // pool of statuses
  )
  .map(([numSources, clipsPerSourcePool, statusPool]) => {
    const sources: SourceRecord[] = [];
    const clips: ClipAnnotation[] = [];
    let statusIdx = 0;

    for (let s = 0; s < numSources; s++) {
      const src: SourceRecord = {
        source_id: `src_${s}`,
        youtube_url: `https://youtube.com/watch?v=abc${s}`,
        title: `Source ${s}`,
        channel: 'channel',
        upload_date: '2024-01-01',
        duration_seconds: 120,
        fps: 30,
        width: 1920,
        height: 1080,
        total_frames: 3600,
        video_file: `sources/yt_abc${s}.mp4`,
        audio_file: `sources/yt_abc${s}.wav`,
        detected_bpm: 130,
        bpm_confidence: 0.9,
        downbeat_offset_seconds: 0.1,
        beat_grid: [0.46, 0.92],
        beat_grid_frames: [14, 28],
        energy_profile: [0.5, 0.6],
        downloaded_at: '2024-01-01T00:00:00Z',
      };
      sources.push(src);

      const numClips = clipsPerSourcePool[s];
      for (let c = 0; c < numClips; c++) {
        const status = statusPool[statusIdx % statusPool.length];
        statusIdx++;
        clips.push(clipArb(clips.length, src.source_id, status));
      }
    }

    return {
      schema_version: '2.0' as const,
      project: {
        name: 'Test Project',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      sources,
      enum_definitions: DEFAULT_ENUM_DEFINITIONS,
      clips,
    };
  });

// ---------------------------------------------------------------------------
// Stub completeness calculator (not relevant for manifest consistency)
// ---------------------------------------------------------------------------

const stubCompleteness = (_clip: ClipAnnotation): number => 0.5;

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Property 16: Manifest Consistency', () => {
  it('sources_count equals number of sources, clips_total equals number of clips, and clips_by_status sums to clips_total', () => {
    fc.assert(
      fc.property(projectFileArb, (projectFile) => {
        const manifest = computeManifest(projectFile, stubCompleteness);

        // sources_count matches sources array length
        expect(manifest.sources_count).toBe(projectFile.sources.length);

        // clips_total matches clips array length
        expect(manifest.clips_total).toBe(projectFile.clips.length);

        // clips_by_status counts sum to clips_total
        const statusSum = Object.values(manifest.clips_by_status).reduce(
          (sum, count) => sum + count,
          0,
        );
        expect(statusSum).toBe(manifest.clips_total);

        // Each status count is non-negative
        for (const status of CLIP_STATUS_VALUES) {
          expect(manifest.clips_by_status[status]).toBeGreaterThanOrEqual(0);
        }

        // Each status count matches the actual count in the clips array
        for (const status of CLIP_STATUS_VALUES) {
          const actualCount = projectFile.clips.filter((c) => c.status === status).length;
          expect(manifest.clips_by_status[status]).toBe(actualCount);
        }
      }),
      { numRuns: 100 },
    );
  });
});
