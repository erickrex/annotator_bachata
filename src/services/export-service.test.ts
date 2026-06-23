import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import type { VirtualClipDef, ClipAnnotation } from '../types/index.js';

// Mock child_process.execFile to capture ffmpeg arguments
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

// Mock node:util to return our mock as the promisified version
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

// Mock fs/promises
const mkdirMock = vi.fn().mockResolvedValue(undefined);
const writeFileMock = vi.fn().mockResolvedValue(undefined);
const accessMock = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  access: (...args: unknown[]) => accessMock(...args),
}));

function makeClip(overrides: Partial<VirtualClipDef> = {}): VirtualClipDef {
  return {
    clipId: 'src1_c001_016',
    sourceId: 'src1',
    status: 'pending',
    remotion: {
      fromFrame: 120,
      durationInFrames: 150,
      fps: 30,
    },
    beatMarkerFrames: [0, 15, 30],
    cycleNumber: 1,
    beatCount: 16,
    extractedFile: '/project/sources/clips/src1/src1_c001_016.mp4',
    handleBefore: 0.5,
    handleAfter: 0.5,
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
  return {
    clip_id: 'src1_c001_016',
    source_id: 'src1',
    status: 'pending',
    remotion: { from_frame: 120, duration_in_frames: 150, fps: 30 },
    move_name: 'Basic Step',
    difficulty: 'beginner',
    style: 'sensual',
    tags: ['basic', 'lead'],
    ...overrides,
  };
}

describe('export-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    accessMock.mockResolvedValue(undefined);
  });

  describe('computeTrimRange', () => {
    it('uses inPoint and outPoint when set', async () => {
      const { computeTrimRange } = await import('./export-service.js');
      const clip = makeClip({ inPoint: 1.0, outPoint: 3.5 });
      const result = computeTrimRange(clip);
      expect(result.seekPosition).toBe(1.0);
      expect(result.duration).toBe(2.5);
    });

    it('falls back to handleBefore-based defaults when no trim points are set', async () => {
      const { computeTrimRange } = await import('./export-service.js');
      // durationInFrames=150, fps=30 => clipDuration=5s, handleBefore=0.5
      // seekPosition = handleBefore = 0.5
      // outPoint = handleBefore + clipDuration = 0.5 + 5 = 5.5
      // duration = 5.5 - 0.5 = 5
      const clip = makeClip({ inPoint: undefined, outPoint: undefined });
      const result = computeTrimRange(clip);
      expect(result.seekPosition).toBe(0.5);
      expect(result.duration).toBe(5);
    });

    it('falls back to 0 when handleBefore is not set', async () => {
      const { computeTrimRange } = await import('./export-service.js');
      // handleBefore=undefined => 0, clipDuration=5s
      // seekPosition = 0, outPoint = 0 + 5 = 5, duration = 5
      const clip = makeClip({ inPoint: undefined, outPoint: undefined, handleBefore: undefined });
      const result = computeTrimRange(clip);
      expect(result.seekPosition).toBe(0);
      expect(result.duration).toBe(5);
    });
  });

  describe('exportClip', () => {
    it('invokes ffmpeg with correct -ss, -t, -i, -c copy arguments', async () => {
      const { exportClip } = await import('./export-service.js');
      const clip = makeClip({ inPoint: 1.2, outPoint: 4.7 });
      const annotation = makeAnnotation();

      await exportClip({ clip, annotation, outputDir: '/tmp/exports' });

      expect(execFileMock).toHaveBeenCalledWith('ffmpeg', [
        '-y',
        '-ss', '1.2',
        '-t', '3.5',
        '-i', '/project/sources/clips/src1/src1_c001_016.mp4',
        '-c', 'copy',
        join('/tmp/exports', 'src1_c001_016.mp4'),
      ]);
    });

    it('uses fallback trim range when no trim points are set', async () => {
      const { exportClip } = await import('./export-service.js');
      // handleBefore=0.5, clipDuration=5s => seekPosition=0.5, duration=5
      const clip = makeClip({ inPoint: undefined, outPoint: undefined });
      const annotation = makeAnnotation();

      await exportClip({ clip, annotation, outputDir: '/tmp/exports' });

      expect(execFileMock).toHaveBeenCalledWith('ffmpeg', [
        '-y',
        '-ss', '0.5',
        '-t', '5',
        '-i', '/project/sources/clips/src1/src1_c001_016.mp4',
        '-c', 'copy',
        join('/tmp/exports', 'src1_c001_016.mp4'),
      ]);
    });

    it('writes sidecar JSON with correct content', async () => {
      const { exportClip } = await import('./export-service.js');
      const clip = makeClip({ inPoint: 1.0, outPoint: 4.0 });
      const annotation = makeAnnotation({
        move_name: 'Cross Body Lead',
        difficulty: 'intermediate',
        style: 'traditional',
        tags: ['turn', 'lead', 'cross-body'],
      });

      await exportClip({ clip, annotation, outputDir: '/tmp/exports' });

      expect(writeFileMock).toHaveBeenCalledWith(
        join('/tmp/exports', 'src1_c001_016.json'),
        expect.any(String),
        'utf-8',
      );

      const writtenJson = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenJson).toEqual({
        clip_id: 'src1_c001_016',
        source_id: 'src1',
        move_name: 'Cross Body Lead',
        difficulty: 'intermediate',
        style: 'traditional',
        tags: ['turn', 'lead', 'cross-body'],
        duration_seconds: 3,
        trim: {
          inPoint: 1.0,
          outPoint: 4.0,
        },
      });
    });

    it('throws when extractedFile is not set', async () => {
      const { exportClip } = await import('./export-service.js');
      const clip = makeClip({ extractedFile: undefined });
      const annotation = makeAnnotation();

      await expect(
        exportClip({ clip, annotation, outputDir: '/tmp/exports' }),
      ).rejects.toThrow('has no extracted file path set');
    });

    it('throws with stderr content when ffmpeg exits non-zero', async () => {
      const { exportClip } = await import('./export-service.js');
      const clip = makeClip({ inPoint: 1.0, outPoint: 3.0 });
      const annotation = makeAnnotation();

      execFileMock.mockRejectedValue({
        stderr: 'Error: invalid input file format\nConversion failed!',
      });

      await expect(
        exportClip({ clip, annotation, outputDir: '/tmp/exports' }),
      ).rejects.toThrow('ffmpeg export failed for clip src1_c001_016');
    });
  });

  describe('exportBatch', () => {
    it('yields results for each non-discarded clip', async () => {
      const { exportBatch } = await import('./export-service.js');

      const clips = [
        { clip: makeClip({ clipId: 'c001', inPoint: 0, outPoint: 2 }), annotation: makeAnnotation({ clip_id: 'c001' }) },
        { clip: makeClip({ clipId: 'c002', inPoint: 1, outPoint: 3 }), annotation: makeAnnotation({ clip_id: 'c002' }) },
        { clip: makeClip({ clipId: 'c003', status: 'discarded' as const, inPoint: 0, outPoint: 1 }), annotation: makeAnnotation({ clip_id: 'c003' }) },
      ];

      const results: string[] = [];
      for await (const result of exportBatch(clips, '/tmp/exports')) {
        results.push(result.clipId);
      }

      // Should skip the discarded clip
      expect(results).toEqual(['c001', 'c002']);
      // ffmpeg called twice (not for discarded)
      expect(execFileMock).toHaveBeenCalledTimes(2);
    });

    it('calls onProgress callback for each clip', async () => {
      const { exportBatch } = await import('./export-service.js');

      const clips = [
        { clip: makeClip({ clipId: 'c001', inPoint: 0, outPoint: 2 }), annotation: makeAnnotation({ clip_id: 'c001' }) },
      ];

      const progressCalls: Array<[string, number]> = [];
      const onProgress = (clipId: string, percent: number) => {
        progressCalls.push([clipId, percent]);
      };

      for await (const _result of exportBatch(clips, '/tmp/exports', onProgress)) {
        // consume
      }

      expect(progressCalls).toEqual([
        ['c001', 0],
        ['c001', 100],
      ]);
    });
  });
});
