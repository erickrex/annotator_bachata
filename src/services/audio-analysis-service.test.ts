/**
 * Unit tests for the Audio Analysis Service subprocess wrapper.
 *
 * These tests mock child_process.spawn to verify:
 * - Correct command and argument construction
 * - JSON parsing and snake_case → camelCase mapping
 * - Non-zero exit code error handling (stderr surfaced)
 * - Invalid JSON error handling
 * - Timeout with process kill
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

/** Helper to create a fake ChildProcess with controllable stdout/stderr. */
function createFakeProcess(): ChildProcess & {
  _emitStdout: (data: string) => void;
  _emitStderr: (data: string) => void;
  _close: (code: number | null) => void;
  _emitError: (err: Error) => void;
} {
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  const proc = new EventEmitter() as ChildProcess & {
    _emitStdout: (data: string) => void;
    _emitStderr: (data: string) => void;
    _close: (code: number | null) => void;
    _emitError: (err: Error) => void;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdout = stdoutEmitter as unknown as Readable;
  proc.stderr = stderrEmitter as unknown as Readable;
  proc.kill = vi.fn();

  proc._emitStdout = (data: string) => stdoutEmitter.emit('data', Buffer.from(data));
  proc._emitStderr = (data: string) => stderrEmitter.emit('data', Buffer.from(data));
  proc._close = (code: number | null) => proc.emit('close', code);
  proc._emitError = (err: Error) => proc.emit('error', err);

  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => fakeProc),
}));

// Import after mock is set up
const { analyze } = await import('./audio-analysis-service.js');
const { spawn } = await import('node:child_process');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioAnalysisService – analyze()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const SAMPLE_PYTHON_OUTPUT = JSON.stringify({
    bpm: 128.0,
    bpm_confidence: 0.92,
    downbeat_offset_seconds: 1.35,
    beat_timestamps: [1.35, 1.819, 2.288],
    beat_frames: [40, 54, 68],
    energy_profile: [0.12, 0.15, 0.18],
  });

  it('spawns uv with correct arguments', () => {
    analyze('/tmp/song.wav', 30);

    expect(spawn).toHaveBeenCalledWith('uv', [
      'run', 'python', '-m', 'analyzer.analyze',
      '/tmp/song.wav',
      '--fps', '30',
    ]);

    // Clean up – close the process so the promise settles
    fakeProc._emitStdout(SAMPLE_PYTHON_OUTPUT);
    fakeProc._close(0);
  });

  it('parses valid JSON and maps snake_case to camelCase', async () => {
    const promise = analyze('/tmp/song.wav', 30);

    fakeProc._emitStdout(SAMPLE_PYTHON_OUTPUT);
    fakeProc._close(0);

    const result = await promise;

    expect(result).toEqual({
      detectedBpm: 128.0,
      bpmConfidence: 0.92,
      downbeatOffsetSeconds: 1.35,
      beatGrid: [1.35, 1.819, 2.288],
      beatGridFrames: [40, 54, 68],
      energyProfile: [0.12, 0.15, 0.18],
    });
  });

  it('rejects with stderr content on non-zero exit code', async () => {
    const promise = analyze('/tmp/bad.wav', 30);

    fakeProc._emitStderr('Error: WAV file not found: /tmp/bad.wav');
    fakeProc._close(1);

    await expect(promise).rejects.toThrow(
      'Audio analysis failed (exit code 1): Error: WAV file not found: /tmp/bad.wav'
    );
  });

  it('rejects with fallback message when stderr is empty on non-zero exit', async () => {
    const promise = analyze('/tmp/bad.wav', 30);

    fakeProc._close(1);

    await expect(promise).rejects.toThrow(
      'Audio analysis failed (exit code 1): (no stderr output)'
    );
  });

  it('rejects with descriptive message on invalid JSON output', async () => {
    const promise = analyze('/tmp/song.wav', 30);

    fakeProc._emitStdout('not valid json {{{');
    fakeProc._close(0);

    await expect(promise).rejects.toThrow(
      'Failed to parse audio analysis output as JSON'
    );
  });

  it('rejects when subprocess fails to start', async () => {
    const promise = analyze('/tmp/song.wav', 30);

    fakeProc._emitError(new Error('ENOENT'));

    await expect(promise).rejects.toThrow(
      'Failed to start audio analysis subprocess: ENOENT'
    );
  });

  it('kills the process and rejects on timeout (60s)', async () => {
    const promise = analyze('/tmp/song.wav', 30);

    // Advance past the 60s timeout
    vi.advanceTimersByTime(60_000);

    await expect(promise).rejects.toThrow('Audio analysis timed out after 60s');
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('handles chunked stdout correctly', async () => {
    const promise = analyze('/tmp/song.wav', 30);

    // Send JSON in two chunks
    const json = SAMPLE_PYTHON_OUTPUT;
    const mid = Math.floor(json.length / 2);
    fakeProc._emitStdout(json.slice(0, mid));
    fakeProc._emitStdout(json.slice(mid));
    fakeProc._close(0);

    const result = await promise;
    expect(result.detectedBpm).toBe(128.0);
    expect(result.beatGrid).toHaveLength(3);
  });
});
