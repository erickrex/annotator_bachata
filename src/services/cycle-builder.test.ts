import { describe, expect, it } from 'vitest';
import { buildCycles, shiftBeatGrid, recomputeWithDownbeat } from './cycle-builder.js';

// Helper: generate evenly-spaced beat grids for testing.
function makeBeatGrid(count: number, startTime: number, interval: number, fps: number) {
  const timestamps: number[] = [];
  const frames: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = startTime + i * interval;
    timestamps.push(t);
    frames.push(Math.round(t * fps));
  }
  return { timestamps, frames };
}

const FPS = 30;
const INTERVAL = 0.5; // 120 BPM

describe('buildCycles', () => {
  it('groups 16 beats from downbeat 0 into 2 cycles', () => {
    const { timestamps, frames } = makeBeatGrid(16, 0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 0);

    expect(result.cycles8).toHaveLength(2);
    expect(result.cycles8[0].cycleNumber).toBe(1);
    expect(result.cycles8[0].startBeatIndex).toBe(0);
    expect(result.cycles8[0].endBeatIndex).toBe(7);
    expect(result.cycles8[1].cycleNumber).toBe(2);
    expect(result.cycles8[1].startBeatIndex).toBe(8);
    expect(result.cycles8[1].endBeatIndex).toBe(15);
  });

  it('discards leftover beats that do not form a complete cycle', () => {
    const { timestamps, frames } = makeBeatGrid(20, 0, INTERVAL, FPS); // 2 full + 4 leftover
    const result = buildCycles(frames, timestamps, 0);

    expect(result.cycles8).toHaveLength(2);
  });

  it('starts grouping from the given downbeat index', () => {
    const { timestamps, frames } = makeBeatGrid(24, 0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 4);

    // 24 - 4 = 20 beats from downbeat → 2 full cycles
    expect(result.cycles8).toHaveLength(2);
    expect(result.cycles8[0].startBeatIndex).toBe(4);
    expect(result.cycles8[0].endBeatIndex).toBe(11);
  });

  it('marks cycle boundaries with correct timestamps and frames', () => {
    const { timestamps, frames } = makeBeatGrid(8, 1.0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 0);

    const c = result.cycles8[0];
    expect(c.startTimestamp).toBe(1.0);
    expect(c.endTimestamp).toBe(1.0 + 7 * INTERVAL);
    expect(c.startFrame).toBe(Math.round(1.0 * FPS));
    expect(c.endFrame).toBe(Math.round((1.0 + 7 * INTERVAL) * FPS));
  });

  it('assembles 16-count phrases from pairs of cycles', () => {
    const { timestamps, frames } = makeBeatGrid(32, 0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 0);

    expect(result.phrases16).toHaveLength(2);
    expect(result.phrases16[0].cycles).toHaveLength(2);
    expect(result.phrases16[0].phraseNumber).toBe(1);
    expect(result.phrases16[0].startFrame).toBe(result.cycles8[0].startFrame);
    expect(result.phrases16[0].endFrame).toBe(result.cycles8[1].endFrame);
  });

  it('assembles 32-count phrases from groups of 4 cycles', () => {
    const { timestamps, frames } = makeBeatGrid(32, 0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 0);

    expect(result.phrases32).toHaveLength(1);
    expect(result.phrases32[0].cycles).toHaveLength(4);
  });

  it('returns empty hierarchy when not enough beats for a single cycle', () => {
    const { timestamps, frames } = makeBeatGrid(7, 0, INTERVAL, FPS);
    const result = buildCycles(frames, timestamps, 0);

    expect(result.cycles8).toHaveLength(0);
    expect(result.phrases16).toHaveLength(0);
    expect(result.phrases32).toHaveLength(0);
  });
});

describe('shiftBeatGrid', () => {
  it('shifts all timestamps by the given offset in ms', () => {
    const timestamps = [1.0, 1.5, 2.0];
    const result = shiftBeatGrid(timestamps, 200, FPS);

    expect(result.timestamps).toEqual([1.2, 1.7, 2.2]);
  });

  it('recomputes frame numbers from shifted timestamps', () => {
    const timestamps = [1.0, 2.0];
    const result = shiftBeatGrid(timestamps, 500, FPS);

    expect(result.frames).toEqual([
      Math.round(1.5 * FPS),
      Math.round(2.5 * FPS),
    ]);
  });

  it('handles negative offsets', () => {
    const timestamps = [1.0, 2.0];
    const result = shiftBeatGrid(timestamps, -500, FPS);

    expect(result.timestamps).toEqual([0.5, 1.5]);
  });

  it('returns empty arrays for empty input', () => {
    const result = shiftBeatGrid([], 100, FPS);
    expect(result.timestamps).toEqual([]);
    expect(result.frames).toEqual([]);
  });
});

describe('recomputeWithDownbeat', () => {
  it('rebuilds hierarchy from a new downbeat index', () => {
    const { timestamps, frames } = makeBeatGrid(24, 0, INTERVAL, FPS);

    const original = buildCycles(frames, timestamps, 0);
    const recomputed = recomputeWithDownbeat(frames, timestamps, 8);

    // Original: 3 cycles starting at index 0
    expect(original.cycles8).toHaveLength(3);
    // Recomputed: 2 cycles starting at index 8
    expect(recomputed.cycles8).toHaveLength(2);
    expect(recomputed.cycles8[0].startBeatIndex).toBe(8);
  });
});
