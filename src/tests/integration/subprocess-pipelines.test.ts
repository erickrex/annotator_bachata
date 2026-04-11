/**
 * Integration tests for subprocess pipelines.
 *
 * These tests verify that the external tool integrations (yt-dlp, Python/librosa,
 * Remotion) are correctly wired up. They are skipped by default because they
 * require external dependencies to be installed:
 *
 *   - yt-dlp: YouTube video downloader binary
 *   - uv + Python: Python package manager and runtime (for librosa analyzer)
 *   - ffmpeg: Media processing (used by Remotion renderer)
 *   - @remotion/renderer: Remotion rendering package
 *
 * To run these tests, set the environment variable:
 *   INTEGRATION=1 npx vitest run src/tests/integration/
 *
 * The tests are designed to be fast and offline:
 *   - yt-dlp: only checks binary availability (--version), no actual downloads
 *   - librosa: creates a small WAV programmatically and runs the analyzer
 *   - Remotion: only verifies the renderMedia import resolves
 *
 * Validates: Requirements 1.1, 2.1, 12.1
 */

import { describe, it, expect } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helper: check if a binary is available on PATH
// ---------------------------------------------------------------------------
function binaryExists(name: string): boolean {
  try {
    execFileSync(name, ['--version'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch (err: unknown) {
    // If the binary ran but returned non-zero, it still exists
    if (err && typeof err === 'object' && 'status' in err && err.status !== null) {
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: create a WAV file with a rhythmic pulse pattern (~3 seconds)
// This generates a click track at ~120 BPM so librosa can detect beats.
// ---------------------------------------------------------------------------
function createTestWav(filePath: string): void {
  const sampleRate = 22050;
  const durationSec = 3;
  const numSamples = sampleRate * durationSec;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;            // PCM format
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data sub-chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Generate a rhythmic click track at ~120 BPM (beat every 0.5s)
  // Each "click" is a short burst of 880 Hz lasting ~20ms
  const beatIntervalSamples = Math.round(sampleRate * 0.5); // 0.5s = 120 BPM
  const clickDurationSamples = Math.round(sampleRate * 0.02); // 20ms click

  for (let i = 0; i < numSamples; i++) {
    const posInBeat = i % beatIntervalSamples;
    let sample = 0;

    if (posInBeat < clickDurationSamples) {
      // Click: short 880 Hz burst with envelope
      const t = i / sampleRate;
      const envelope = 1.0 - (posInBeat / clickDurationSamples); // decay
      sample = Math.sin(2 * Math.PI * 880 * t) * 0.8 * envelope;
    }

    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  writeFileSync(filePath, buffer);
}

// ---------------------------------------------------------------------------
// Skip the entire suite unless INTEGRATION=1 is set
// ---------------------------------------------------------------------------
const runIntegration = process.env.INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

const hasYtDlp = runIntegration && binaryExists('yt-dlp');
const hasUv = runIntegration && binaryExists('uv');

describeIntegration('Subprocess Pipeline Integration Tests', () => {

  // -------------------------------------------------------------------------
  // 1. yt-dlp subprocess — verify binary exists and responds to --version
  //    Validates: Requirement 1.1
  //    Skipped if yt-dlp is not installed on the system.
  // -------------------------------------------------------------------------
  const describeYtDlp = hasYtDlp ? describe : describe.skip;

  describeYtDlp('yt-dlp subprocess', () => {
    it('should return a version string from yt-dlp --version', () => {
      const output = execFileSync('yt-dlp', ['--version'], {
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim();

      // yt-dlp version looks like "2024.01.01" or similar date-based format
      expect(output).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    });

    it('should accept --help without error (validates CLI interface)', () => {
      const result = execFileSync('yt-dlp', ['--help'], {
        encoding: 'utf-8',
        timeout: 10_000,
      });

      // yt-dlp help output contains "usage:" (case-insensitive)
      expect(result.toLowerCase()).toContain('usage');
    });
  });

  // -------------------------------------------------------------------------
  // 2. librosa subprocess — create a WAV and run the Python analyzer
  //    Validates: Requirement 2.1
  //    Skipped if uv is not installed on the system.
  // -------------------------------------------------------------------------
  const describeLibrosa = hasUv ? describe : describe.skip;

  describeLibrosa('librosa analyzer subprocess', () => {
    const testDir = join(tmpdir(), `clip-slicer-test-${Date.now()}`);
    const wavPath = join(testDir, 'test-tone.wav');

    beforeAll(() => {
      mkdirSync(testDir, { recursive: true });
      createTestWav(wavPath);
    });

    afterAll(() => {
      try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('should run the analyzer and produce valid JSON output', async () => {
      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
        const proc = spawn('uv', ['run', 'python', '-m', 'analyzer.analyze', wavPath, '--fps', '30'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('error', reject);
        proc.on('close', (code) => resolve({ stdout, stderr, code }));
      });

      // The process should exit successfully
      expect(result.code).toBe(0);

      // stdout should be valid JSON
      const parsed = JSON.parse(result.stdout);

      // Verify the JSON shape matches the design contract
      expect(parsed).toHaveProperty('bpm');
      expect(parsed).toHaveProperty('bpm_confidence');
      expect(parsed).toHaveProperty('downbeat_offset_seconds');
      expect(parsed).toHaveProperty('beat_timestamps');
      expect(parsed).toHaveProperty('beat_frames');
      expect(parsed).toHaveProperty('energy_profile');

      // Type checks
      expect(typeof parsed.bpm).toBe('number');
      expect(typeof parsed.bpm_confidence).toBe('number');
      expect(typeof parsed.downbeat_offset_seconds).toBe('number');
      expect(Array.isArray(parsed.beat_timestamps)).toBe(true);
      expect(Array.isArray(parsed.beat_frames)).toBe(true);
      expect(Array.isArray(parsed.energy_profile)).toBe(true);

      // BPM should be non-negative (may be 0 for very short/synthetic audio)
      expect(parsed.bpm).toBeGreaterThanOrEqual(0);

      // BPM confidence should be in [0, 1]
      expect(parsed.bpm_confidence).toBeGreaterThanOrEqual(0);
      expect(parsed.bpm_confidence).toBeLessThanOrEqual(1);

      // Energy profile should have entries (non-empty audio)
      expect(parsed.energy_profile.length).toBeGreaterThan(0);

      // beat_timestamps and beat_frames should have the same length
      expect(parsed.beat_timestamps.length).toBe(parsed.beat_frames.length);

      // All beat frames should be non-negative integers
      for (const frame of parsed.beat_frames) {
        expect(Number.isInteger(frame)).toBe(true);
        expect(frame).toBeGreaterThanOrEqual(0);
      }
    }, 60_000);

    it('should fail with non-zero exit code for a missing file', async () => {
      const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        const proc = spawn('uv', ['run', 'python', '-m', 'analyzer.analyze', '/nonexistent/file.wav', '--fps', '30'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        proc.on('error', reject);
        proc.on('close', (code) => resolve({ code, stderr }));
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Error');
    }, 30_000);
  });

  // -------------------------------------------------------------------------
  // 3. Remotion renderMedia — verify the import resolves
  //    Validates: Requirement 12.1
  // -------------------------------------------------------------------------
  describe('Remotion renderer', () => {
    it('should be able to import @remotion/renderer with renderMedia', async () => {
      // Dynamic import to match how export-service.ts uses it
      const renderer = await import('@remotion/renderer');

      expect(renderer).toBeDefined();
      expect(typeof renderer.renderMedia).toBe('function');
    });

    it('should be able to import the Remotion composition entry point', async () => {
      const remotionIndex = await import('../../remotion/index.js');

      expect(remotionIndex).toBeDefined();
      expect(remotionIndex.Root).toBeDefined();
      expect(remotionIndex.VirtualClip).toBeDefined();
    });
  });
});
