// Feature: clip-slicer-annotator, Property 11: Duration Calculation Consistency
// **Validates: Requirements 7.2, 7.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService } from '../../services/annotation-service.js';
import type { ClipAnnotation, SourceRecord } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(bpm: number): SourceRecord {
  return {
    source_id: 'src1',
    youtube_url: 'https://youtube.com/watch?v=abc123',
    title: 'Test Video',
    channel: 'Test Channel',
    upload_date: '2024-01-01',
    duration_seconds: 600,
    fps: 30,
    width: 1920,
    height: 1080,
    total_frames: 18000,
    video_file: 'sources/src1.mp4',
    audio_file: 'sources/src1.wav',
    detected_bpm: bpm,
    bpm_confidence: 0.95,
    downbeat_offset_seconds: 0.1,
    beat_grid: [0.1],
    beat_grid_frames: [3],
    energy_profile: [0.5],
    downloaded_at: '2024-01-01T00:00:00Z',
  };
}

describe('Property 11: Duration Calculation Consistency', () => {
  it('duration_seconds equals durationInFrames / fps for any clip', () => {
    const arb = fc.record({
      durationInFrames: fc.integer({ min: 1, max: 100000 }),
      fps: fc.integer({ min: 24, max: 60 }),
      bpm: fc.integer({ min: 60, max: 200 }),
    });

    fc.assert(
      fc.property(arb, ({ durationInFrames, fps, bpm }) => {
        const svc = createAnnotationService('Test');
        svc.addSource(makeSource(bpm));

        svc.updateAnnotation('clip1', {
          clip_id: 'clip1',
          source_id: 'src1',
          status: 'in_progress',
          remotion: { from_frame: 0, duration_in_frames: durationInFrames, fps },
          estimated_tempo_bpm: bpm,
        } as Partial<ClipAnnotation>);

        const ann = svc.getAnnotation('clip1')!;

        // duration_seconds should equal durationInFrames / fps
        expect(ann.duration_seconds).toBeCloseTo(durationInFrames / fps, 10);

        // bars_total should equal beats_total / 4 (when beats_total > 0)
        if (ann.beats_total > 0) {
          expect(ann.bars_total).toBeCloseTo(ann.beats_total / 4, 10);
        }
      }),
      { numRuns: 100 },
    );
  });
});
