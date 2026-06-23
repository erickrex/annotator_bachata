import { describe, it, expect } from 'vitest';
import { createClips, mergeClips, splitClip } from './clip-manager.js';
import type { CycleHierarchy, Cycle } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple CycleHierarchy with `n` 8-count cycles, each 80 frames long at 30fps. */
function makeCycles(n: number): CycleHierarchy {
  const cycles8: Cycle[] = [];
  for (let i = 0; i < n; i++) {
    cycles8.push({
      cycleNumber: i + 1,
      startBeatIndex: i * 8,
      endBeatIndex: i * 8 + 7,
      startFrame: i * 80,
      endFrame: i * 80 + 70, // 8 beats, last beat at +70
      startTimestamp: (i * 80) / 30,
      endTimestamp: (i * 80 + 70) / 30,
    });
  }

  // Build 16-count phrases (pairs)
  const phrases16 = [];
  for (let i = 0; i + 1 < cycles8.length; i += 2) {
    phrases16.push({
      phraseNumber: Math.floor(i / 2) + 1,
      cycles: [cycles8[i], cycles8[i + 1]],
      startFrame: cycles8[i].startFrame,
      endFrame: cycles8[i + 1].endFrame,
    });
  }

  // Build 32-count phrases (groups of 4)
  const phrases32 = [];
  for (let i = 0; i + 3 < cycles8.length; i += 4) {
    phrases32.push({
      phraseNumber: Math.floor(i / 4) + 1,
      cycles: cycles8.slice(i, i + 4),
      startFrame: cycles8[i].startFrame,
      endFrame: cycles8[i + 3].endFrame,
    });
  }

  return { cycles8, phrases16, phrases32 };
}

// ---------------------------------------------------------------------------
// createClips
// ---------------------------------------------------------------------------

describe('createClips', () => {
  it('creates one clip per cycle for beatCount=8', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 8, 30);

    expect(clips).toHaveLength(4);
    clips.forEach((clip, i) => {
      expect(clip.sourceId).toBe('src1');
      expect(clip.beatCount).toBe(8);
      expect(clip.cycleNumber).toBe(i + 1);
      expect(clip.status).toBe('pending');
      expect(clip.remotion.fps).toBe(30);
      expect(clip.remotion.fromFrame).toBe(i * 80);
      expect(clip.remotion.durationInFrames).toBe(71); // endFrame - startFrame + 1
    });
  });

  it('creates one clip per pair for beatCount=16', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);

    expect(clips).toHaveLength(2);
    expect(clips[0].cycleNumber).toBe(1);
    expect(clips[0].remotion.fromFrame).toBe(0);
    // Spans cycles 1-2: from 0 to 150 (cycle2.endFrame), duration = 151
    expect(clips[0].remotion.durationInFrames).toBe(151);
    expect(clips[1].cycleNumber).toBe(3);
  });

  it('creates one clip per group of 4 for beatCount=32', () => {
    const hierarchy = makeCycles(8);
    const clips = createClips('src1', hierarchy, 32, 30);

    expect(clips).toHaveLength(2);
    expect(clips[0].cycleNumber).toBe(1);
    expect(clips[1].cycleNumber).toBe(5);
    expect(clips[0].beatCount).toBe(32);
  });

  it('discards leftover cycles that do not form a complete group', () => {
    const hierarchy = makeCycles(3); // 3 cycles, beatCount=16 needs pairs → 1 clip, 1 leftover
    const clips = createClips('src1', hierarchy, 16, 30);
    expect(clips).toHaveLength(1);
  });

  it('generates correct clip IDs with zero-padded numbers', () => {
    const hierarchy = makeCycles(2);
    const clips = createClips('vid01', hierarchy, 8, 30);

    expect(clips[0].clipId).toBe('vid01_c001_008');
    expect(clips[1].clipId).toBe('vid01_c002_008');
  });

  it('populates beat marker frames for each clip', () => {
    const hierarchy = makeCycles(1);
    const clips = createClips('src1', hierarchy, 8, 30);

    // 8 beats interpolated from frame 0 to frame 70
    expect(clips[0].beatMarkerFrames).toHaveLength(8);
    expect(clips[0].beatMarkerFrames[0]).toBe(0);
    expect(clips[0].beatMarkerFrames[7]).toBe(70);
  });

  it('uses provided beat grid frames when available', () => {
    const hierarchy = makeCycles(1);
    const beatGridFrames = [0, 7, 19, 30, 41, 53, 62, 70];
    const clips = createClips('src1', hierarchy, 8, 30, beatGridFrames);

    expect(clips[0].beatMarkerFrames).toEqual(beatGridFrames);
  });
});

// ---------------------------------------------------------------------------
// Clip ID format
// ---------------------------------------------------------------------------

describe('clip ID format', () => {
  it('follows {sourceId}_c{cycleNumber:03d}_{beatCount:03d}', () => {
    const hierarchy = makeCycles(1);
    const clips = createClips('mySource', hierarchy, 8, 30);
    expect(clips[0].clipId).toMatch(/^mySource_c\d{3}_\d{3}$/);
  });
});

// ---------------------------------------------------------------------------
// mergeClips
// ---------------------------------------------------------------------------

describe('mergeClips', () => {
  it('combines frame ranges of two adjacent clips', () => {
    const hierarchy = makeCycles(2);
    const clips = createClips('src1', hierarchy, 8, 30);
    const merged = mergeClips(clips[0], clips[1]);

    expect(merged.remotion.fromFrame).toBe(clips[0].remotion.fromFrame);
    expect(merged.remotion.durationInFrames).toBe(
      clips[0].remotion.durationInFrames + clips[1].remotion.durationInFrames,
    );
    expect(merged.beatCount).toBe(16);
    expect(merged.cycleNumber).toBe(1);
    expect(merged.sourceId).toBe('src1');
    expect(merged.status).toBe('pending');
  });

  it('generates a new clip ID with combined beat count', () => {
    const hierarchy = makeCycles(2);
    const clips = createClips('src1', hierarchy, 8, 30);
    const merged = mergeClips(clips[0], clips[1]);

    expect(merged.clipId).toBe('src1_c001_016');
  });

  it('offsets beat markers from the second clip onto the merged timeline', () => {
    const hierarchy = makeCycles(2);
    const clips = createClips('src1', hierarchy, 8, 30);
    const merged = mergeClips(clips[0], clips[1]);

    expect(merged.beatMarkerFrames).toEqual([
      ...clips[0].beatMarkerFrames,
      ...clips[1].beatMarkerFrames.map((frame) => frame + clips[0].remotion.durationInFrames),
    ]);
  });
});

// ---------------------------------------------------------------------------
// splitClip
// ---------------------------------------------------------------------------

describe('splitClip', () => {
  it('splits a 16-beat clip into two 8-beat clips at cycle boundary', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);
    const [a, b] = splitClip(clips[0], 80, hierarchy);

    expect(a.beatCount).toBe(8);
    expect(b.beatCount).toBe(8);
    expect(a.cycleNumber).toBe(1);
    expect(b.cycleNumber).toBe(2);
  });

  it('preserves total frame coverage after split', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);
    const original = clips[0];
    const [a, b] = splitClip(original, 80, hierarchy);

    expect(a.remotion.fromFrame).toBe(original.remotion.fromFrame);
    expect(a.remotion.durationInFrames + b.remotion.durationInFrames).toBe(
      original.remotion.durationInFrames,
    );
    expect(b.remotion.fromFrame).toBe(a.remotion.fromFrame + a.remotion.durationInFrames);
  });

  it('snaps to nearest cycle boundary when splitAtFrame is between boundaries', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);
    // Cycle 2 starts at frame 80. Passing 85 should still snap to cycle 2 boundary.
    const [, b] = splitClip(clips[0], 85, hierarchy);

    expect(b.remotion.fromFrame).toBe(80);
  });

  it('generates new clip IDs for both halves', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);
    const [a, b] = splitClip(clips[0], 80, hierarchy);

    expect(a.clipId).not.toBe(clips[0].clipId);
    expect(b.clipId).not.toBe(clips[0].clipId);
    expect(a.clipId).not.toBe(b.clipId);
  });

  it('re-bases beat markers for the second half when splitting a non-zero clip', () => {
    const hierarchy = makeCycles(4);
    const clips = createClips('src1', hierarchy, 16, 30);
    const [a, b] = splitClip(clips[1], 240, hierarchy);

    expect(a.remotion.fromFrame).toBe(160);
    expect(a.beatMarkerFrames[0]).toBe(0);
    expect(a.beatMarkerFrames[a.beatMarkerFrames.length - 1]).toBe(70);
    expect(b.remotion.fromFrame).toBe(240);
    expect(b.beatMarkerFrames[0]).toBe(0);
    expect(b.beatMarkerFrames[b.beatMarkerFrames.length - 1]).toBe(70);
  });

  it('throws when trying to split a clip with fewer than two cycles', () => {
    const hierarchy = makeCycles(2);
    const clips = createClips('src1', hierarchy, 8, 30);

    expect(() => splitClip(clips[0], 40, hierarchy)).toThrow(
      'Clip must contain at least two cycles to be split.',
    );
  });
});


