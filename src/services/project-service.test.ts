import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeManifest,
  saveProject,
  saveManifest,
  loadProject,
  loadManifest,
  createDebouncedSaver,
} from './project-service.js';
import type {
  AnnotationProjectFile,
  ClipAnnotation,
  SourceRecord,
} from '../types/index.js';

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

function makeClip(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
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

function makeProjectFile(
  clips: ClipAnnotation[] = [],
  sources: SourceRecord[] = [makeSource()],
): AnnotationProjectFile {
  return {
    schema_version: '2.0',
    project: {
      name: 'Test Project',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    },
    sources,
    enum_definitions: {} as any,
    clips,
  };
}

/** Simple completeness stub: returns 1.0 for clips with move_name, else 0.5 */
const stubCompleteness = (clip: ClipAnnotation): number =>
  clip.move_name ? 1.0 : 0.5;

// ---------------------------------------------------------------------------
// computeManifest
// ---------------------------------------------------------------------------

describe('computeManifest', () => {
  it('returns correct project_name and timestamps', () => {
    const pf = makeProjectFile();
    const manifest = computeManifest(pf, stubCompleteness);
    expect(manifest.project_name).toBe('Test Project');
    expect(manifest.created_at).toBe('2024-01-01T00:00:00Z');
    expect(manifest.updated_at).toBe('2024-06-01T00:00:00Z');
  });

  it('counts sources correctly', () => {
    const pf = makeProjectFile([], [makeSource(), makeSource({ source_id: 'src2' })]);
    const manifest = computeManifest(pf, stubCompleteness);
    expect(manifest.sources_count).toBe(2);
    expect(manifest.sources).toEqual(['src1', 'src2']);
  });

  it('counts clips_total correctly', () => {
    const clips = [makeClip(), makeClip({ clip_id: 'clip2' })];
    const manifest = computeManifest(makeProjectFile(clips), stubCompleteness);
    expect(manifest.clips_total).toBe(2);
  });

  it('computes clips_by_status with all statuses initialised to 0', () => {
    const manifest = computeManifest(makeProjectFile([]), stubCompleteness);
    expect(manifest.clips_by_status.pending).toBe(0);
    expect(manifest.clips_by_status.discarded).toBe(0);
    expect(manifest.clips_by_status.reviewed).toBe(0);
    expect(manifest.clips_by_status.in_progress).toBe(0);
    expect(manifest.clips_by_status.annotated).toBe(0);
  });

  it('clips_by_status counts sum to clips_total', () => {
    const clips = [
      makeClip({ clip_id: 'c1', status: 'pending' }),
      makeClip({ clip_id: 'c2', status: 'reviewed' }),
      makeClip({ clip_id: 'c3', status: 'reviewed' }),
      makeClip({ clip_id: 'c4', status: 'annotated' }),
      makeClip({ clip_id: 'c5', status: 'discarded' }),
    ];
    const manifest = computeManifest(makeProjectFile(clips), stubCompleteness);
    const sum = Object.values(manifest.clips_by_status).reduce((a, b) => a + b, 0);
    expect(sum).toBe(manifest.clips_total);
    expect(manifest.clips_by_status.pending).toBe(1);
    expect(manifest.clips_by_status.reviewed).toBe(2);
    expect(manifest.clips_by_status.annotated).toBe(1);
    expect(manifest.clips_by_status.discarded).toBe(1);
    expect(manifest.clips_by_status.in_progress).toBe(0);
  });

  it('computes annotation_completeness as average', () => {
    // stubCompleteness returns 1.0 for clips with move_name
    const clips = [makeClip({ clip_id: 'c1' }), makeClip({ clip_id: 'c2' })];
    const manifest = computeManifest(makeProjectFile(clips), stubCompleteness);
    expect(manifest.annotation_completeness).toBe(1.0);
  });

  it('annotation_completeness is 0 when no clips', () => {
    const manifest = computeManifest(makeProjectFile([]), stubCompleteness);
    expect(manifest.annotation_completeness).toBe(0);
  });

  it('annotation_completeness averages mixed values', () => {
    const clips = [
      makeClip({ clip_id: 'c1', move_name: 'basic' }),  // 1.0
      makeClip({ clip_id: 'c2', move_name: '' }),         // 0.5
    ];
    const manifest = computeManifest(makeProjectFile(clips), stubCompleteness);
    expect(manifest.annotation_completeness).toBeCloseTo(0.75, 5);
  });
});

// ---------------------------------------------------------------------------
// File I/O — saveProject / loadProject
// ---------------------------------------------------------------------------

describe('file I/O', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'project-svc-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('saveProject writes valid JSON with 2-space indent', async () => {
    const pf = makeProjectFile([makeClip()]);
    await saveProject(tmpDir, pf);
    const raw = await readFile(join(tmpDir, 'project.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.schema_version).toBe('2.0');
    // Check indentation
    expect(raw).toContain('  "schema_version"');
  });

  it('loadProject reads back what was saved', async () => {
    const pf = makeProjectFile([makeClip()]);
    await saveProject(tmpDir, pf);
    const loaded = await loadProject(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.project.name).toBe('Test Project');
    expect(loaded!.clips).toHaveLength(1);
  });

  it('loadProject returns null for missing file', async () => {
    const loaded = await loadProject(join(tmpDir, 'nonexistent'));
    expect(loaded).toBeNull();
  });

  it('saveManifest writes valid JSON', async () => {
    const manifest = computeManifest(makeProjectFile([makeClip()]), stubCompleteness);
    await saveManifest(tmpDir, manifest);
    const raw = await readFile(join(tmpDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.project_name).toBe('Test Project');
    expect(parsed.clips_total).toBe(1);
  });

  it('loadManifest reads back what was saved', async () => {
    const manifest = computeManifest(makeProjectFile([makeClip()]), stubCompleteness);
    await saveManifest(tmpDir, manifest);
    const loaded = await loadManifest(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.clips_total).toBe(1);
  });

  it('loadManifest returns null for missing file', async () => {
    const loaded = await loadManifest(join(tmpDir, 'nonexistent'));
    expect(loaded).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createDebouncedSaver
// ---------------------------------------------------------------------------

describe('createDebouncedSaver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    tmpDir = await mkdtemp(join(tmpdir(), 'debounce-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('flush writes immediately', async () => {
    const saver = createDebouncedSaver(tmpDir, 5000);
    const pf = makeProjectFile();
    saver.save(pf);
    await saver.flush();
    const loaded = await loadProject(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.project.name).toBe('Test Project');
  });

  it('cancel prevents pending save', async () => {
    const saver = createDebouncedSaver(tmpDir, 5000);
    saver.save(makeProjectFile());
    saver.cancel();
    await vi.advanceTimersByTimeAsync(6000);
    const loaded = await loadProject(tmpDir);
    expect(loaded).toBeNull();
  });

  it('debounces multiple saves', async () => {
    const saver = createDebouncedSaver(tmpDir, 100);
    saver.save(makeProjectFile([], [makeSource({ source_id: 'first' })]));
    saver.save(makeProjectFile([], [makeSource({ source_id: 'second' })]));
    await saver.flush();
    const loaded = await loadProject(tmpDir);
    expect(loaded).not.toBeNull();
    // Only the last save should be written
    expect(loaded!.sources[0].source_id).toBe('second');
  });
});
