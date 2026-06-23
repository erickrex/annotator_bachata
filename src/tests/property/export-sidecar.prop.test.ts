// Feature: codebase-cleanup, Property 4: Sidecar JSON written alongside export
// **Validates: Requirements 4.6**

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { VirtualClipDef, ClipAnnotation } from '../../types/index.js';

// Mock child_process so ffmpeg is not required.
// The promisified execFile in export-service resolves when the callback-based
// execFile calls cb(null, stdout, stderr).
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    cb(null, '', '');
  }),
}));

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const difficultyArb = fc.constantFrom(
  'beginner' as const,
  'intermediate' as const,
  'advanced' as const,
);

const styleArb = fc.constantFrom(
  'sensual' as const,
  'moderna' as const,
  'traditional' as const,
  'fusion' as const,
);

const tagArb = fc.array(
  fc.string({ minLength: 2, maxLength: 10 }).map((s) => s.replace(/[^a-z]/g, 'a')),
  { minLength: 0, maxLength: 5 },
);

const moveNameArb = fc.string({ minLength: 3, maxLength: 20 }).map((s) =>
  s.replace(/[^a-zA-Z ]/g, 'x').trim() || 'move',
);

const clipIdArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9_]{3,10}$/),
    fc.integer({ min: 1, max: 999 }),
    fc.constantFrom(8, 16, 32),
  )
  .map(([src, num, bc]) => `${src}_c${String(num).padStart(3, '0')}_${String(bc).padStart(3, '0')}`);

const sourceIdArb = fc.stringMatching(/^[a-z0-9_]{3,12}$/);

/**
 * Generate a paired VirtualClipDef and ClipAnnotation for export testing.
 */
const clipAnnotationPairArb = fc
  .record({
    clipId: clipIdArb,
    sourceId: sourceIdArb,
    fromFrame: fc.integer({ min: 0, max: 5000 }),
    durationInFrames: fc.integer({ min: 30, max: 3000 }),
    fps: fc.constantFrom(24, 25, 30, 60),
    handleBefore: fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
    inPointFraction: fc.float({ min: 0, max: Math.fround(0.4), noNaN: true, noDefaultInfinity: true }),
    outPointFraction: fc.float({ min: Math.fround(0.6), max: 1, noNaN: true, noDefaultInfinity: true }),
    moveName: moveNameArb,
    difficulty: difficultyArb,
    style: styleArb,
    tags: tagArb,
  })
  .map(({ clipId, sourceId, fromFrame, durationInFrames, fps, handleBefore, inPointFraction, outPointFraction, moveName, difficulty, style, tags }) => {
    const clipDuration = durationInFrames / fps;
    const totalDuration = handleBefore + clipDuration;
    const inPoint = inPointFraction * totalDuration;
    const outPoint = outPointFraction * totalDuration;

    const clip: VirtualClipDef = {
      clipId,
      sourceId,
      status: 'pending' as const,
      remotion: { fromFrame, durationInFrames, fps },
      beatMarkerFrames: [],
      cycleNumber: 1,
      beatCount: 8,
      extractedFile: '', // Will be set to a real temp file path in the test
      handleBefore,
      inPoint,
      outPoint,
    };

    const annotation: ClipAnnotation = {
      clip_id: clipId,
      source_id: sourceId,
      status: 'pending' as const,
      remotion: {
        from_frame: fromFrame,
        duration_in_frames: durationInFrames,
        fps,
      },
      move_name: moveName,
      difficulty,
      style,
      tags,
    };

    return { clip, annotation };
  });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 4: Sidecar JSON written alongside export', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'export-sidecar-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('exportClip produces a .json sidecar file at {outputDir}/{clipId}.json', async () => {
    await fc.assert(
      fc.asyncProperty(clipAnnotationPairArb, async ({ clip, annotation }) => {
        // Create a unique output subdirectory per iteration to avoid conflicts
        const iterDir = join(tempDir, clip.clipId + '_' + Math.random().toString(36).slice(2, 8));
        await mkdir(iterDir, { recursive: true });

        // Create a dummy extracted file so the access() check passes
        const extractedFilePath = join(iterDir, 'source.mp4');
        await writeFile(extractedFilePath, 'dummy mp4 content');
        clip.extractedFile = extractedFilePath;

        const { exportClip } = await import('../../services/export-service.js');

        const result = await exportClip({ clip, annotation, outputDir: iterDir });

        // Verify sidecar path matches expected pattern
        const expectedSidecarPath = join(iterDir, `${clip.clipId}.json`);
        expect(result.sidecarPath).toBe(expectedSidecarPath);

        // Verify the sidecar file actually exists and is valid JSON
        const sidecarContent = await readFile(expectedSidecarPath, 'utf-8');
        const sidecar = JSON.parse(sidecarContent);

        // Verify required fields are present in the sidecar
        expect(sidecar).toHaveProperty('clip_id', clip.clipId);
        expect(sidecar).toHaveProperty('source_id', clip.sourceId);
        expect(sidecar).toHaveProperty('move_name', annotation.move_name);
        expect(sidecar).toHaveProperty('difficulty', annotation.difficulty);
        expect(sidecar).toHaveProperty('style', annotation.style);
        expect(sidecar).toHaveProperty('tags', annotation.tags);
      }),
      { numRuns: 100 },
    );
  });

  it('sidecar .json and .mp4 share the same path prefix', async () => {
    await fc.assert(
      fc.asyncProperty(clipAnnotationPairArb, async ({ clip, annotation }) => {
        const iterDir = join(tempDir, clip.clipId + '_' + Math.random().toString(36).slice(2, 8));
        await mkdir(iterDir, { recursive: true });

        const extractedFilePath = join(iterDir, 'source.mp4');
        await writeFile(extractedFilePath, 'dummy mp4 content');
        clip.extractedFile = extractedFilePath;

        const { exportClip } = await import('../../services/export-service.js');
        const result = await exportClip({ clip, annotation, outputDir: iterDir });

        // Both files should share the same path prefix (directory + clipId)
        const mp4Prefix = result.outputPath.replace(/\.mp4$/, '');
        const jsonPrefix = result.sidecarPath.replace(/\.json$/, '');
        expect(mp4Prefix).toBe(jsonPrefix);
      }),
      { numRuns: 100 },
    );
  });

  it('sidecar contains all required annotation metadata fields', async () => {
    await fc.assert(
      fc.asyncProperty(clipAnnotationPairArb, async ({ clip, annotation }) => {
        const iterDir = join(tempDir, clip.clipId + '_' + Math.random().toString(36).slice(2, 8));
        await mkdir(iterDir, { recursive: true });

        const extractedFilePath = join(iterDir, 'source.mp4');
        await writeFile(extractedFilePath, 'dummy mp4 content');
        clip.extractedFile = extractedFilePath;

        const { exportClip } = await import('../../services/export-service.js');
        await exportClip({ clip, annotation, outputDir: iterDir });

        const sidecarContent = await readFile(join(iterDir, `${clip.clipId}.json`), 'utf-8');
        const sidecar = JSON.parse(sidecarContent);

        // All six required fields must be present
        expect(sidecar.clip_id).toBe(clip.clipId);
        expect(sidecar.source_id).toBe(clip.sourceId);
        expect(sidecar.move_name).toBe(annotation.move_name);
        expect(sidecar.difficulty).toBe(annotation.difficulty);
        expect(sidecar.style).toBe(annotation.style);
        expect(sidecar.tags).toEqual(annotation.tags);
      }),
      { numRuns: 100 },
    );
  });
});
