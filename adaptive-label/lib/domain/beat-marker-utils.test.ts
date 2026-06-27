import { describe, expect, it } from 'vitest';
import { recomputeBeatMarkers } from '@/lib/domain/beat-marker-utils';
import type { VirtualClipDef } from '@/lib/domain/types';

/**
 * Helper to create a minimal VirtualClipDef for testing.
 * Defaults: fps=30, fromFrame=0, durationInFrames=150 (5 seconds at 30fps).
 */
function makeClip(overrides: Partial<VirtualClipDef> & { remotion?: Partial<VirtualClipDef['remotion']> } = {}): VirtualClipDef {
  const { remotion: remotionOverrides, ...rest } = overrides;
  return {
    clipId: 'test-clip-001',
    sourceId: 'test-source',
    status: 'pending' as const,
    remotion: {
      fromFrame: 0,
      durationInFrames: 150,
      fps: 30,
      ...remotionOverrides,
    },
    beatMarkerFrames: [],
    cycleNumber: 1,
    beatCount: 8,
    ...rest,
  };
}

describe('recomputeBeatMarkers', () => {
  it('returns empty array when sourceBeatGridFrames is empty', () => {
    const clip = makeClip();
    const result = recomputeBeatMarkers(clip, []);
    expect(result).toEqual([]);
  });

  it('returns empty array when no beats fall within the trimmed range', () => {
    // Clip spans frames 0–150 at 30fps (5 seconds), trimmed to 1s–2s → absolute frames 30–60
    const clip = makeClip({ inPoint: 1, outPoint: 2 });
    // All beats are outside the range (before and after)
    const sourceBeatGridFrames = [10, 15, 20, 25, 65, 70, 80];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    expect(result).toEqual([]);
  });

  it('returns correct markers when all beats are within range', () => {
    // Clip: fromFrame=0, fps=30, duration=150 (5s), trim 1s–3s → absolute frames 30–90
    const clip = makeClip({ inPoint: 1, outPoint: 3 });
    const sourceBeatGridFrames = [35, 45, 60, 75, 85];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // All beats are within [30, 90), offset by 30 → [5, 15, 30, 45, 55]
    expect(result).toEqual([5, 15, 30, 45, 55]);
  });

  it('returns only in-range beats when some are outside', () => {
    // Clip: fromFrame=100, fps=30, duration=150 (5s), trim 1s–3s
    // Absolute range: 100 + 30 = 130 to 100 + 90 = 190
    const clip = makeClip({
      remotion: { fromFrame: 100, durationInFrames: 150, fps: 30 },
      inPoint: 1,
      outPoint: 3,
    });
    const sourceBeatGridFrames = [100, 120, 135, 150, 170, 185, 195, 210];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [130, 190): 135, 150, 170, 185
    // Offset by 130: 5, 20, 40, 55
    expect(result).toEqual([5, 20, 40, 55]);
  });

  it('correctly offsets markers relative to trim start (frame 0 = inPoint)', () => {
    // Clip: fromFrame=60, fps=30, duration=300 (10s), trim 2s–5s
    // inPointFrame = 2*30 = 60, outPointFrame = 5*30 = 150
    // absoluteStart = 60 + 60 = 120, absoluteEnd = 60 + 150 = 210
    const clip = makeClip({
      remotion: { fromFrame: 60, durationInFrames: 300, fps: 30 },
      inPoint: 2,
      outPoint: 5,
    });
    const sourceBeatGridFrames = [120, 135, 150, 180, 200, 209];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // All in [120, 210), offset by 120: [0, 15, 30, 60, 80, 89]
    expect(result).toEqual([0, 15, 30, 60, 80, 89]);
  });

  it('works with no trim points set (defaults to full clip range)', () => {
    // Clip: fromFrame=50, fps=30, duration=90 (3s), no inPoint/outPoint
    // Defaults: inPoint=0, outPoint=90/30=3s
    // absoluteStart = 50 + 0 = 50, absoluteEnd = 50 + 90 = 140
    const clip = makeClip({
      remotion: { fromFrame: 50, durationInFrames: 90, fps: 30 },
    });
    const sourceBeatGridFrames = [40, 50, 65, 80, 100, 130, 139, 140, 150];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [50, 140): 50, 65, 80, 100, 130, 139
    // Offset by 50: [0, 15, 30, 50, 80, 89]
    expect(result).toEqual([0, 15, 30, 50, 80, 89]);
  });

  it('works with only inPoint set', () => {
    // Clip: fromFrame=0, fps=30, duration=150 (5s), inPoint=2 (no outPoint → defaults to 5s)
    // absoluteStart = 0 + 60 = 60, absoluteEnd = 0 + 150 = 150
    const clip = makeClip({ inPoint: 2 });
    const sourceBeatGridFrames = [30, 60, 75, 90, 120, 145, 149, 150, 160];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [60, 150): 60, 75, 90, 120, 145, 149
    // Offset by 60: [0, 15, 30, 60, 85, 89]
    expect(result).toEqual([0, 15, 30, 60, 85, 89]);
  });

  it('works with only outPoint set', () => {
    // Clip: fromFrame=0, fps=30, duration=150 (5s), outPoint=3 (no inPoint → defaults to 0)
    // absoluteStart = 0 + 0 = 0, absoluteEnd = 0 + 90 = 90
    const clip = makeClip({ outPoint: 3 });
    const sourceBeatGridFrames = [0, 15, 30, 60, 85, 89, 90, 100];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [0, 90): 0, 15, 30, 60, 85, 89
    // Offset by 0: [0, 15, 30, 60, 85, 89]
    expect(result).toEqual([0, 15, 30, 60, 85, 89]);
  });

  it('handles edge case: beat exactly at absoluteStart is included', () => {
    // Clip: fromFrame=100, fps=30, duration=90 (3s), inPoint=1, outPoint=2
    // absoluteStart = 100 + 30 = 130, absoluteEnd = 100 + 60 = 160
    const clip = makeClip({
      remotion: { fromFrame: 100, durationInFrames: 90, fps: 30 },
      inPoint: 1,
      outPoint: 2,
    });
    // Beat exactly at 130 (absoluteStart) should be included
    const sourceBeatGridFrames = [129, 130, 145, 159, 160];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [130, 160): 130, 145, 159
    // Offset by 130: [0, 15, 29]
    expect(result).toEqual([0, 15, 29]);
  });

  it('handles edge case: beat exactly at absoluteEnd is excluded', () => {
    // Clip: fromFrame=100, fps=30, duration=90 (3s), inPoint=1, outPoint=2
    // absoluteStart = 100 + 30 = 130, absoluteEnd = 100 + 60 = 160
    const clip = makeClip({
      remotion: { fromFrame: 100, durationInFrames: 90, fps: 30 },
      inPoint: 1,
      outPoint: 2,
    });
    // Beat exactly at 160 (absoluteEnd) should be excluded
    const sourceBeatGridFrames = [130, 155, 159, 160, 161];
    const result = recomputeBeatMarkers(clip, sourceBeatGridFrames);
    // In range [130, 160): 130, 155, 159
    // Offset by 130: [0, 25, 29]
    expect(result).toEqual([0, 25, 29]);
  });
});
