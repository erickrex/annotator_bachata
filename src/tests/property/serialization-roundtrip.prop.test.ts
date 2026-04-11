// Feature: clip-slicer-annotator, Property 23: Serialization Round-Trip
// **Validates: Requirements 18.1, 18.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService } from '../../services/annotation-service.js';
import type { ClipAnnotation, SourceRecord } from '../../types/index.js';

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
    // Use real files so import file-existence check passes
    video_file: 'package.json',
    audio_file: 'tsconfig.json',
    detected_bpm: 130,
    bpm_confidence: 0.95,
    downbeat_offset_seconds: 0.1,
    beat_grid: [0.1, 0.562],
    beat_grid_frames: [3, 17],
    energy_profile: [0.5, 0.6],
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
    completion_profile: {
      basico_completion_counts: 1,
      tempo_feel: 'even_finish',
      accent_pattern: 'even',
      syncopation_level: 0.2,
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
    embedding_refs: {},
    ...overrides,
  };
}

// Generator: random number of clips (1-5) with unique IDs
const clipCountArb = fc.integer({ min: 1, max: 5 });

describe('Property 23: Serialization Round-Trip', () => {
  it('export then import produces equivalent project state', () => {
    fc.assert(
      fc.property(clipCountArb, (clipCount) => {
        // Build original service with sources and clips
        const original = createAnnotationService('RoundTrip Project');
        original.addSource(makeSource());

        const clipIds: string[] = [];
        for (let i = 0; i < clipCount; i++) {
          const clipId = `src1_c${String(i + 1).padStart(3, '0')}_008`;
          clipIds.push(clipId);
          original.updateAnnotation(
            clipId,
            makeValidClip({ clip_id: clipId }),
          );
        }

        // Export
        const exported = original.exportProject();

        // Import into a fresh service
        const restored = createAnnotationService();
        const importResult = restored.importProject(exported, '.');

        expect(importResult.success).toBe(true);
        expect(importResult.clipsLoaded).toBe(clipCount);

        // Verify all clips round-tripped
        for (const clipId of clipIds) {
          const origClip = original.getAnnotation(clipId)!;
          const restoredClip = restored.getAnnotation(clipId)!;

          expect(restoredClip).not.toBeNull();
          expect(restoredClip.clip_id).toBe(origClip.clip_id);
          expect(restoredClip.source_id).toBe(origClip.source_id);
          expect(restoredClip.move_name).toBe(origClip.move_name);
          expect(restoredClip.remotion).toEqual(origClip.remotion);
          expect(restoredClip.entry_state).toEqual(origClip.entry_state);
          expect(restoredClip.exit_state).toEqual(origClip.exit_state);
          expect(restoredClip.trim_profile).toEqual(origClip.trim_profile);
        }

        // Verify sources round-tripped
        const origSource = original.getSource('src1')!;
        const restoredSource = restored.getSource('src1')!;
        expect(restoredSource.source_id).toBe(origSource.source_id);
        expect(restoredSource.detected_bpm).toBe(origSource.detected_bpm);
        expect(restoredSource.beat_grid).toEqual(origSource.beat_grid);
      }),
      { numRuns: 100 },
    );
  });
});
