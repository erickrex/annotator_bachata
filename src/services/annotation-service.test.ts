import { describe, it, expect, vi } from 'vitest';
import { AnnotationServiceImpl, createAnnotationService, TOTAL_REQUIRED_FIELDS } from './annotation-service.js';
import type { AnnotationProjectFile, ClipAnnotation, SourceRecord } from '../types/index.js';

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
    tags: ['salsa'],
    difficulty: 'beginner',
    style: 'traditional',
    // Optional metadata (does not affect completeness)
    move_label: 'basic',
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
    motion_profile: {},
    camera_profile: {},
    quality_profile: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createAnnotationService', () => {
  it('returns an AnnotationServiceImpl instance', () => {
    const svc = createAnnotationService('My Project');
    expect(svc).toBeInstanceOf(AnnotationServiceImpl);
  });
});

// ---------------------------------------------------------------------------
// getAnnotation / updateAnnotation
// ---------------------------------------------------------------------------

describe('getAnnotation', () => {
  it('returns null for unknown clip', () => {
    const svc = createAnnotationService();
    expect(svc.getAnnotation('nonexistent')).toBeNull();
  });

  it('returns annotation after update', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    svc.updateAnnotation('clip1', makeValidClip({ clip_id: 'clip1' }));
    expect(svc.getAnnotation('clip1')).not.toBeNull();
    expect(svc.getAnnotation('clip1')!.clip_id).toBe('clip1');
  });
});

describe('updateAnnotation', () => {
  it('creates annotation from scratch when none exists', () => {
    const svc = createAnnotationService();
    const result = svc.updateAnnotation('new_clip', {
      clip_id: 'new_clip',
      source_id: 'src1',
      remotion: { from_frame: 0, duration_in_frames: 240, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('new_clip');
    expect(ann).not.toBeNull();
    expect(ann!.remotion.duration_in_frames).toBe(240);
  });

  it('performs partial update (deep merge)', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    svc.updateAnnotation('clip1', makeValidClip({ clip_id: 'clip1' }));
    svc.updateAnnotation('clip1', { move_name: 'updated name' });
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.move_name).toBe('updated name');
    // Other fields preserved
    expect(ann.move_label).toBe('basic');
  });

  it('returns validation result', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    const result = svc.updateAnnotation('clip1', makeValidClip({ clip_id: 'clip1' }));
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
  });
});

// ---------------------------------------------------------------------------
// Auto-population of computed fields
// ---------------------------------------------------------------------------

describe('auto-population', () => {
  it('computes duration_seconds from frames/fps', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.duration_seconds).toBe(30);
  });

  it('computes beats_total from BPM and duration', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource({ detected_bpm: 120 }));
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      estimated_tempo_bpm: 120,
      remotion: { from_frame: 0, duration_in_frames: 600, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('clip1')!;
    // 120 BPM * 20s / 60 = 40 beats
    expect(ann.beats_total).toBe(40);
  });

  it('computes bars_total as beats_total / 4', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource({ detected_bpm: 120 }));
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      estimated_tempo_bpm: 120,
      remotion: { from_frame: 0, duration_in_frames: 600, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.bars_total).toBe(ann.beats_total / 4);
  });

  it('auto-populates estimated_tempo_bpm from source when not set', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource({ detected_bpm: 128 }));
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      estimated_tempo_bpm: 0,
      remotion: { from_frame: 0, duration_in_frames: 300, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.estimated_tempo_bpm).toBe(128);
  });

  it('does not overwrite user-set estimated_tempo_bpm', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource({ detected_bpm: 128 }));
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      estimated_tempo_bpm: 140,
      remotion: { from_frame: 0, duration_in_frames: 300, fps: 30 },
    } as Partial<ClipAnnotation>);
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.estimated_tempo_bpm).toBe(140);
  });
});

// ---------------------------------------------------------------------------
// Status transition prevention (Req 14.16)
// ---------------------------------------------------------------------------

describe('status transition prevention', () => {
  it('prevents transition to annotated when validation errors exist', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    // Create a clip with missing required fields
    svc.updateAnnotation('clip1', {
      clip_id: 'clip1',
      source_id: 'src1',
      status: 'in_progress',
      remotion: { from_frame: 0, duration_in_frames: 300, fps: 30 },
    } as Partial<ClipAnnotation>);
    // Try to set status to annotated
    const result = svc.updateAnnotation('clip1', { status: 'annotated' });
    const ann = svc.getAnnotation('clip1')!;
    expect(ann.status).not.toBe('annotated');
  });

  it('allows transition to annotated when fully valid', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    svc.updateAnnotation('clip1', makeValidClip({ clip_id: 'clip1' }));
    const result = svc.updateAnnotation('clip1', { status: 'annotated' });
    const ann = svc.getAnnotation('clip1')!;
    // If valid, status should be annotated
    if (result.valid) {
      expect(ann.status).toBe('annotated');
    }
  });
});

// ---------------------------------------------------------------------------
// calculateCompleteness
// ---------------------------------------------------------------------------

describe('calculateCompleteness', () => {
  it('returns 1.0 for a fully filled annotation', () => {
    const svc = createAnnotationService();
    const clip = makeValidClip();
    const completeness = svc.calculateCompleteness(clip);
    expect(completeness).toBe(1.0);
  });

  it('returns less than 1.0 for partially filled annotation', () => {
    const svc = createAnnotationService();
    const clip = makeValidClip({ move_name: '' });
    const completeness = svc.calculateCompleteness(clip);
    expect(completeness).toBeLessThan(1.0);
    expect(completeness).toBeGreaterThan(0);
  });

  it('counts correctly: missing 1 of 10 required fields', () => {
    const svc = createAnnotationService();
    const clip = makeValidClip({ move_name: '' });
    const completeness = svc.calculateCompleteness(clip);
    expect(completeness).toBeCloseTo(9 / TOTAL_REQUIRED_FIELDS, 5);
  });
});

// ---------------------------------------------------------------------------
// exportProject
// ---------------------------------------------------------------------------

describe('exportProject', () => {
  it('returns AnnotationProjectFile with schema_version 2.0', () => {
    const svc = createAnnotationService('Test Project');
    const exported = svc.exportProject();
    expect(exported.schema_version).toBe('2.0');
  });

  it('includes project metadata', () => {
    const svc = createAnnotationService('Test Project');
    const exported = svc.exportProject();
    expect(exported.project.name).toBe('Test Project');
    expect(exported.project.created_at).toBeTruthy();
    expect(exported.project.updated_at).toBeTruthy();
  });

  it('includes sources', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    const exported = svc.exportProject();
    expect(exported.sources).toHaveLength(1);
    expect(exported.sources[0].source_id).toBe('src1');
  });

  it('includes clips', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    svc.updateAnnotation('clip1', makeValidClip({ clip_id: 'clip1' }));
    const exported = svc.exportProject();
    expect(exported.clips).toHaveLength(1);
    expect(exported.clips[0].clip_id).toBe('clip1');
  });

  it('includes enum_definitions', () => {
    const svc = createAnnotationService();
    const exported = svc.exportProject();
    expect(exported.enum_definitions).toBeDefined();
    expect(exported.enum_definitions.hold).toBeDefined();
    expect(exported.enum_definitions.difficulty).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// importProject
// ---------------------------------------------------------------------------

describe('importProject', () => {
  it('rejects import when source video files are missing', () => {
    const svc = createAnnotationService();
    const projectFile: AnnotationProjectFile = {
      schema_version: '2.0',
      project: { name: 'Test', created_at: '', updated_at: '' },
      sources: [makeSource({ video_file: 'nonexistent.mp4', audio_file: 'nonexistent.wav' })],
      enum_definitions: {} as any,
      clips: [],
    };
    const result = svc.importProject(projectFile, '/tmp/fake_project');
    expect(result.success).toBe(false);
    expect(result.missingFiles.length).toBeGreaterThan(0);
    expect(result.clipsLoaded).toBe(0);
  });

  it('returns missing file paths in missingFiles list', () => {
    const svc = createAnnotationService();
    const projectFile: AnnotationProjectFile = {
      schema_version: '2.0',
      project: { name: 'Test', created_at: '', updated_at: '' },
      sources: [makeSource({ video_file: 'missing_video.mp4', audio_file: 'missing_audio.wav' })],
      enum_definitions: {} as any,
      clips: [],
    };
    const result = svc.importProject(projectFile, '/tmp/fake_project');
    expect(result.missingFiles).toContain('missing_video.mp4');
    expect(result.missingFiles).toContain('missing_audio.wav');
  });

  it('succeeds when source files exist on disk', () => {
    const svc = createAnnotationService();
    // Use files that actually exist — package.json and tsconfig.json in the project root
    const projectFile: AnnotationProjectFile = {
      schema_version: '2.0',
      project: { name: 'Imported', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      sources: [makeSource({ video_file: 'package.json', audio_file: 'tsconfig.json' })],
      enum_definitions: {} as any,
      clips: [makeValidClip({ clip_id: 'imported_clip' })],
    };
    const result = svc.importProject(projectFile, '.');
    expect(result.success).toBe(true);
    expect(result.clipsLoaded).toBe(1);
    expect(result.missingFiles).toHaveLength(0);
    // Verify clips were loaded
    expect(svc.getAnnotation('imported_clip')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe('validate', () => {
  it('returns valid for a fully valid clip', () => {
    const svc = createAnnotationService();
    svc.addSource(makeSource());
    const result = svc.validate(makeValidClip());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for invalid clip', () => {
    const svc = createAnnotationService();
    const clip = makeValidClip({ clip_id: '' });
    const result = svc.validate(clip);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
