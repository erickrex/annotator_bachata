import { describe, expect, it } from 'vitest';
import { buildCycles, shiftBeatGrid, recomputeWithDownbeat } from '@/lib/domain/cycle-builder';

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

describe('buildCycles with configurable beatsPerCycle', () => {
  // Use a 32-beat grid so we can test all cycle sizes with at least one full cycle
  const { timestamps, frames } = makeBeatGrid(32, 0, INTERVAL, FPS);

  it('produces 8-beat cycles when beatsPerCycle is omitted (backward compatibility)', () => {
    const result = buildCycles(frames, timestamps, 0);

    expect(result.cycles8).toHaveLength(4); // 32 / 8 = 4
    for (const cycle of result.cycles8) {
      const span = cycle.endBeatIndex - cycle.startBeatIndex + 1;
      expect(span).toBe(8);
    }
  });

  it('produces 4-beat cycles when beatsPerCycle=4', () => {
    const result = buildCycles(frames, timestamps, 0, 4);

    expect(result.cycles8).toHaveLength(8); // 32 / 4 = 8
    for (const cycle of result.cycles8) {
      const span = cycle.endBeatIndex - cycle.startBeatIndex + 1;
      expect(span).toBe(4);
    }
    // First cycle: beats 0–3
    expect(result.cycles8[0].startBeatIndex).toBe(0);
    expect(result.cycles8[0].endBeatIndex).toBe(3);
    // Second cycle: beats 4–7
    expect(result.cycles8[1].startBeatIndex).toBe(4);
    expect(result.cycles8[1].endBeatIndex).toBe(7);
  });

  it('produces 16-beat cycles when beatsPerCycle=16', () => {
    const result = buildCycles(frames, timestamps, 0, 16);

    expect(result.cycles8).toHaveLength(2); // 32 / 16 = 2
    for (const cycle of result.cycles8) {
      const span = cycle.endBeatIndex - cycle.startBeatIndex + 1;
      expect(span).toBe(16);
    }
    // First cycle: beats 0–15
    expect(result.cycles8[0].startBeatIndex).toBe(0);
    expect(result.cycles8[0].endBeatIndex).toBe(15);
    // Second cycle: beats 16–31
    expect(result.cycles8[1].startBeatIndex).toBe(16);
    expect(result.cycles8[1].endBeatIndex).toBe(31);
  });

  it('produces 32-beat cycles when beatsPerCycle=32', () => {
    const result = buildCycles(frames, timestamps, 0, 32);

    expect(result.cycles8).toHaveLength(1); // 32 / 32 = 1
    const cycle = result.cycles8[0];
    const span = cycle.endBeatIndex - cycle.startBeatIndex + 1;
    expect(span).toBe(32);
    expect(cycle.startBeatIndex).toBe(0);
    expect(cycle.endBeatIndex).toBe(31);
  });

  it('discards leftover beats for beatsPerCycle=4', () => {
    // 35 beats: 35 / 4 = 8 full cycles, 3 leftover
    const grid = makeBeatGrid(35, 0, INTERVAL, FPS);
    const result = buildCycles(grid.frames, grid.timestamps, 0, 4);

    expect(result.cycles8).toHaveLength(8);
  });

  it('discards leftover beats for beatsPerCycle=16', () => {
    // 35 beats: 35 / 16 = 2 full cycles, 3 leftover
    const grid = makeBeatGrid(35, 0, INTERVAL, FPS);
    const result = buildCycles(grid.frames, grid.timestamps, 0, 16);

    expect(result.cycles8).toHaveLength(2);
  });

  it('computes phrases16 correctly for beatsPerCycle=4 (groups of 4 cycles)', () => {
    const result = buildCycles(frames, timestamps, 0, 4);

    // 8 cycles of 4 beats each; phrases16 groups 16/4=4 cycles per phrase → 2 phrases
    expect(result.phrases16).toHaveLength(2);
    expect(result.phrases16[0].cycles).toHaveLength(4);
    expect(result.phrases16[1].cycles).toHaveLength(4);
  });

  it('computes phrases32 correctly for beatsPerCycle=4 (groups of 8 cycles)', () => {
    const result = buildCycles(frames, timestamps, 0, 4);

    // 8 cycles of 4 beats each; phrases32 groups 32/4=8 cycles per phrase → 1 phrase
    expect(result.phrases32).toHaveLength(1);
    expect(result.phrases32[0].cycles).toHaveLength(8);
  });

  it('returns empty phrases32 when beatsPerCycle=32 (32/32=1, only 1 cycle per phrase, but need grouping)', () => {
    const result = buildCycles(frames, timestamps, 0, 32);

    // 32/32 = 1 cycle per phrase32 group → 1 phrase32
    expect(result.phrases32).toHaveLength(1);
  });

  it('returns empty phrases16 when beatsPerCycle=32 (16/32 < 1)', () => {
    const result = buildCycles(frames, timestamps, 0, 32);

    // 16/32 = 0.5 < 1, so no phrases16
    expect(result.phrases16).toHaveLength(0);
  });
});
