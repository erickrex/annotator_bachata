import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtendedProjectFile } from './project-service.js';
import type { VirtualClipDef } from '../types/index.js';

// We need to control process.cwd() for these tests, so we mock it.
// Also need to reset the singleton between tests.
let tmpDir: string;

describe('getAppState restore from project.json', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'app-state-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('restores clips, cycles, and analysisResults from project.json on first call', async () => {
    // Create source files so importProject succeeds
    await mkdir(join(tmpDir, 'sources'), { recursive: true });
    await writeFile(join(tmpDir, 'sources', 'src1.mp4'), '');
    await writeFile(join(tmpDir, 'sources', 'src1.wav'), '');

    const clip: VirtualClipDef = {
      clipId: 'src1_c001_008',
      sourceId: 'src1',
      status: 'pending',
      remotion: { fromFrame: 0, durationInFrames: 240, fps: 30 },
      beatMarkerFrames: [0, 30, 60, 90, 120, 150, 180, 210],
      cycleNumber: 1,
      beatCount: 8,
    };

    const projectFile: ExtendedProjectFile = {
      schema_version: '2.0',
      project: {
        name: 'Test Restore',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
      },
      sources: [
        {
          source_id: 'src1',
          youtube_url: 'https://youtube.com/watch?v=abc',
          title: 'Test',
          channel: 'Ch',
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
        },
      ],
      enum_definitions: {} as any,
      clips: [
        {
          clip_id: 'src1_c001_008',
          source_id: 'src1',
          status: 'pending',
          remotion: { from_frame: 0, duration_in_frames: 240, fps: 30 },
          move_name: '',
          move_label: '' as any,
          tags: [],
          difficulty: '' as any,
          energy_level: '' as any,
          style: '' as any,
          estimated_tempo_bpm: 130,
          duration_seconds: 8,
          beats_total: 8,
          bars_total: 2,
          phrase_resolution: '' as any,
          song_position: {
            start_time_seconds: 0,
            end_time_seconds: 8,
            cycle_number: 1,
            beat_start: 1,
            beat_end: 8,
          },
          entry_state: {
            hold: '' as any,
            leader_weight_foot: '' as any,
            follower_weight_foot: '' as any,
          },
          exit_state: {
            hold: '' as any,
            leader_weight_foot: '' as any,
            follower_weight_foot: '' as any,
          },
          trim_profile: { trim_safe_start_seconds: 0, trim_safe_end_seconds: 8 },
          motion_profile: {},
          camera_profile: {},
          quality_profile: {},
        },
      ],
      virtual_clips: [clip],
      cycle_hierarchies: [
        [
          'src1',
          {
            cycles8: [
              {
                cycleNumber: 1,
                startBeatIndex: 0,
                endBeatIndex: 7,
                startFrame: 0,
                endFrame: 240,
                startTimestamp: 0,
                endTimestamp: 8,
              },
            ],
            phrases16: [],
            phrases32: [],
          },
        ],
      ],
      analysis_results: [
        [
          'src1',
          {
            detectedBpm: 130,
            bpmConfidence: 0.95,
            downbeatOffsetSeconds: 0.1,
            beatGrid: [0.1],
            beatGridFrames: [3],
            energyProfile: [0.5],
          },
        ],
      ],
    };

    await writeFile(
      join(tmpDir, 'project.json'),
      JSON.stringify(projectFile, null, 2),
      'utf-8',
    );

    // Mock process.cwd to point to our temp dir, then dynamically import
    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      // Dynamic import to get a fresh module with the mocked cwd
      // We need to reset the singleton first
      const mod = await import('./app-state.js');
      mod.resetAppState();

      const state = mod.getAppState();

      // Verify clips were restored
      expect(state.clips.size).toBe(1);
      expect(state.clips.get('src1_c001_008')).toBeDefined();
      expect(state.clips.get('src1_c001_008')!.clipId).toBe('src1_c001_008');

      // Verify cycles were restored
      expect(state.cycles.size).toBe(1);
      expect(state.cycles.get('src1')).toBeDefined();

      // Verify analysis results were restored
      expect(state.analysisResults.size).toBe(1);
      expect(state.analysisResults.get('src1')).toBeDefined();
      expect(state.analysisResults.get('src1')!.detectedBpm).toBe(130);

      // Verify annotations were imported
      const annotation = state.annotationService.getAnnotation('src1_c001_008');
      expect(annotation).not.toBeNull();
      expect(annotation!.source_id).toBe('src1');

      // Clean up singleton
      mod.resetAppState();
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('starts with empty state when no project.json exists', async () => {
    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      const mod = await import('./app-state.js');
      mod.resetAppState();

      const state = mod.getAppState();
      expect(state.clips.size).toBe(0);
      expect(state.cycles.size).toBe(0);
      expect(state.analysisResults.size).toBe(0);

      mod.resetAppState();
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('starts with empty state when project.json is malformed', async () => {
    await writeFile(join(tmpDir, 'project.json'), 'not valid json', 'utf-8');

    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      const mod = await import('./app-state.js');
      mod.resetAppState();

      const state = mod.getAppState();
      expect(state.clips.size).toBe(0);
      expect(state.cycles.size).toBe(0);
      expect(state.analysisResults.size).toBe(0);

      mod.resetAppState();
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('restoreProjectState replaces stale runtime data on import', async () => {
    await mkdir(join(tmpDir, 'sources'), { recursive: true });
    await writeFile(join(tmpDir, 'sources', 'src1.mp4'), '');
    await writeFile(join(tmpDir, 'sources', 'src1.wav'), '');

    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      const mod = await import('./app-state.js');
      mod.resetAppState();

      const state = mod.getAppState();
      state.clips.set('stale_clip', {
        clipId: 'stale_clip',
        sourceId: 'src1',
        status: 'pending',
        remotion: { fromFrame: 0, durationInFrames: 80, fps: 30 },
        beatMarkerFrames: [0, 10],
        cycleNumber: 1,
        beatCount: 8,
      });
      state.cycles.set('src1', { cycles8: [], phrases16: [], phrases32: [] });
      state.analysisResults.set('src1', {
        detectedBpm: 120,
        bpmConfidence: 0.9,
        downbeatOffsetSeconds: 0,
        beatGrid: [0],
        beatGridFrames: [0],
        energyProfile: [0.1],
      });

      const importedProject: ExtendedProjectFile = {
        schema_version: '2.0',
        project: {
          name: 'Imported Project',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
        sources: [
          {
            source_id: 'src1',
            youtube_url: 'https://youtube.com/watch?v=abc',
            title: 'Test',
            channel: 'Ch',
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
          },
        ],
        enum_definitions: {} as any,
        clips: [
          {
            clip_id: 'imported_clip',
            source_id: 'src1',
            status: 'pending',
            remotion: { from_frame: 0, duration_in_frames: 240, fps: 30 },
            move_name: '',
            move_label: '' as any,
            tags: [],
            difficulty: '' as any,
            energy_level: '' as any,
            style: '' as any,
            estimated_tempo_bpm: 130,
            duration_seconds: 8,
            beats_total: 8,
            bars_total: 2,
            phrase_resolution: '' as any,
            song_position: {
              start_time_seconds: 0,
              end_time_seconds: 8,
              cycle_number: 1,
              beat_start: 1,
              beat_end: 8,
            },
            entry_state: {
              hold: '' as any,
              leader_weight_foot: '' as any,
              follower_weight_foot: '' as any,
            },
            exit_state: {
              hold: '' as any,
              leader_weight_foot: '' as any,
              follower_weight_foot: '' as any,
            },
            trim_profile: { trim_safe_start_seconds: 0, trim_safe_end_seconds: 8 },
            motion_profile: {},
            camera_profile: {},
            quality_profile: {},
          },
        ],
      };

      const result = mod.restoreProjectState(importedProject);
      expect(result.success).toBe(true);
      expect(state.clips.size).toBe(0);
      expect(state.cycles.size).toBe(0);
      expect(state.analysisResults.size).toBe(0);
      expect(state.annotationService.getAnnotation('imported_clip')).not.toBeNull();

      mod.resetAppState();
    } finally {
      process.cwd = originalCwd;
    }
  });
});

describe('Data model deduplication: VirtualClipDef as single source of truth', () => {
  beforeEach(async () => {
    const mod = await import('./app-state.js');
    mod.resetAppState();
  });

  afterEach(async () => {
    const mod = await import('./app-state.js');
    mod.resetAppState();
  });

  it('ClipAnnotation.remotion is derived from VirtualClipDef timing on serialization', async () => {
    const mod = await import('./app-state.js');

    const clip: VirtualClipDef = {
      clipId: 'test_c001_008',
      sourceId: 'src1',
      status: 'pending',
      remotion: { fromFrame: 100, durationInFrames: 300, fps: 30 },
      beatMarkerFrames: [0, 30, 60],
      cycleNumber: 1,
      beatCount: 8,
    };

    mod.upsertClip(clip);

    const projectState = mod.getFullProjectState();
    const annotation = projectState.clips.find((c) => c.clip_id === 'test_c001_008');

    expect(annotation).toBeDefined();
    expect(annotation!.remotion).toEqual({
      from_frame: 100,
      duration_in_frames: 300,
      fps: 30,
    });
  });

  it('updating VirtualClipDef timing propagates to ClipAnnotation on next serialization', async () => {
    const mod = await import('./app-state.js');

    const clip: VirtualClipDef = {
      clipId: 'test_c002_008',
      sourceId: 'src1',
      status: 'pending',
      remotion: { fromFrame: 50, durationInFrames: 200, fps: 24 },
      beatMarkerFrames: [],
      cycleNumber: 2,
      beatCount: 8,
    };

    // Insert clip with initial timing
    mod.upsertClip(clip);

    // Verify initial serialization
    let projectState = mod.getFullProjectState();
    let annotation = projectState.clips.find((c) => c.clip_id === 'test_c002_008');
    expect(annotation!.remotion).toEqual({
      from_frame: 50,
      duration_in_frames: 200,
      fps: 24,
    });

    // Update the VirtualClipDef timing directly (simulating a trim or re-slice)
    const state = mod.getAppState();
    const storedClip = state.clips.get('test_c002_008')!;
    storedClip.remotion.fromFrame = 120;
    storedClip.remotion.durationInFrames = 480;
    storedClip.remotion.fps = 30;

    // Re-serialize — annotation should reflect the updated timing without manual sync
    projectState = mod.getFullProjectState();
    annotation = projectState.clips.find((c) => c.clip_id === 'test_c002_008');

    expect(annotation!.remotion).toEqual({
      from_frame: 120,
      duration_in_frames: 480,
      fps: 30,
    });
  });

  it('no manual sync is needed: annotation remotion always reflects current VirtualClipDef', async () => {
    const mod = await import('./app-state.js');

    const clip: VirtualClipDef = {
      clipId: 'test_c003_008',
      sourceId: 'src1',
      status: 'pending',
      remotion: { fromFrame: 0, durationInFrames: 240, fps: 30 },
      beatMarkerFrames: [0, 30],
      cycleNumber: 3,
      beatCount: 8,
    };

    mod.upsertClip(clip);

    // Perform multiple timing updates without calling any sync function
    const state = mod.getAppState();
    const storedClip = state.clips.get('test_c003_008')!;

    // First update
    storedClip.remotion.fromFrame = 10;
    storedClip.remotion.durationInFrames = 100;

    let projectState = mod.getFullProjectState();
    let annotation = projectState.clips.find((c) => c.clip_id === 'test_c003_008');
    expect(annotation!.remotion.from_frame).toBe(10);
    expect(annotation!.remotion.duration_in_frames).toBe(100);

    // Second update — still no manual sync call
    storedClip.remotion.fromFrame = 500;
    storedClip.remotion.durationInFrames = 60;
    storedClip.remotion.fps = 60;

    projectState = mod.getFullProjectState();
    annotation = projectState.clips.find((c) => c.clip_id === 'test_c003_008');
    expect(annotation!.remotion).toEqual({
      from_frame: 500,
      duration_in_frames: 60,
      fps: 60,
    });
  });

  it('upsertClip with new timing replaces annotation remotion on serialization', async () => {
    const mod = await import('./app-state.js');

    const clip: VirtualClipDef = {
      clipId: 'test_c004_008',
      sourceId: 'src1',
      status: 'pending',
      remotion: { fromFrame: 0, durationInFrames: 240, fps: 30 },
      beatMarkerFrames: [],
      cycleNumber: 4,
      beatCount: 8,
    };

    mod.upsertClip(clip);

    // Now upsert the same clip with different timing (simulating re-generation)
    const updatedClip: VirtualClipDef = {
      ...clip,
      remotion: { fromFrame: 300, durationInFrames: 480, fps: 60 },
    };

    mod.upsertClip(updatedClip);

    const projectState = mod.getFullProjectState();
    const annotation = projectState.clips.find((c) => c.clip_id === 'test_c004_008');

    expect(annotation!.remotion).toEqual({
      from_frame: 300,
      duration_in_frames: 480,
      fps: 60,
    });
  });
});
