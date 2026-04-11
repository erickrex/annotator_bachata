// Feature: clip-slicer-annotator, Property 14: Import Rejects Missing Source Files
// **Validates: Requirements 13.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createAnnotationService } from '../../services/annotation-service.js';
import type { AnnotationProjectFile, SourceRecord } from '../../types/index.js';
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
    video_file: 'nonexistent_video.mp4',
    audio_file: 'nonexistent_audio.wav',
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

// Generator: random non-existent file paths
const fakePathArb = fc
  .tuple(
    fc.string({ minLength: 3, maxLength: 20 }),
    fc.constantFrom('.mp4', '.avi', '.mkv', '.wav', '.mp3'),
  )
  .map(([name, ext]) => `nonexistent/${name.replace(/[^a-z0-9_]/gi, 'x')}${ext}`);

describe('Property 14: Import Rejects Missing Source Files', () => {
  it('import fails with missing files listed when source paths do not exist', () => {
    fc.assert(
      fc.property(
        fakePathArb,
        fakePathArb,
        fc.uuid(),
        (videoPath, audioPath, sourceId) => {
          const svc = createAnnotationService('Test');

          const projectFile: AnnotationProjectFile = {
            schema_version: '2.0',
            project: {
              name: 'Test Project',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
            sources: [
              makeSource({
                source_id: sourceId,
                video_file: videoPath,
                audio_file: audioPath,
              }),
            ],
            enum_definitions: { ...DEFAULT_ENUM_DEFINITIONS },
            clips: [],
          };

          const result = svc.importProject(projectFile, '.');

          // Import should fail
          expect(result.success).toBe(false);
          expect(result.clipsLoaded).toBe(0);

          // Missing files list should contain the non-existent paths
          expect(result.missingFiles.length).toBeGreaterThan(0);

          // At least the video path should be listed (audio may also be listed)
          const allMissing = result.missingFiles;
          expect(
            allMissing.includes(videoPath) || allMissing.includes(audioPath),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
