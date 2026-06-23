/**
 * Audio Analysis Service — invokes the Python beat_this analyzer CLI as a subprocess
 * and parses its JSON output into an AudioAnalysisResult.
 */

import { spawn } from 'node:child_process';
import type { AudioAnalysisResult } from '../types/index.js';

/** Timeout for the analysis subprocess (60 seconds). */
const ANALYSIS_TIMEOUT_MS = 60 * 1000;

/** Shape of the JSON emitted by the Python analyzer CLI. */
interface PythonAnalyzerOutput {
  bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_timestamps: number[];
  beat_frames: number[];
  energy_profile: number[];
}

/**
 * Run the Python beat_this analyzer on a WAV file and return structured results.
 *
 * Spawns `uv run python -m analyzer.analyze <wavPath> --fps <fps>`, captures
 * stdout JSON, and maps snake_case keys to the camelCase AudioAnalysisResult.
 *
 * @throws {Error} If the subprocess exits non-zero (includes stderr content).
 * @throws {Error} If stdout cannot be parsed as valid JSON.
 * @throws {Error} If the subprocess exceeds the 60-second timeout.
 */
export async function analyze(wavPath: string, fps: number): Promise<AudioAnalysisResult> {
  return new Promise<AudioAnalysisResult>((resolve, reject) => {
    const proc = spawn('uv', [
      'run', 'python', '-m', 'analyzer.analyze',
      wavPath,
      '--fps', String(fps),
    ]);

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Audio analysis timed out after ${ANALYSIS_TIMEOUT_MS / 1000}s`));
    }, ANALYSIS_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start audio analysis subprocess: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        const detail = stderr.trim() || '(no stderr output)';
        reject(new Error(`Audio analysis failed (exit code ${code}): ${detail}`));
        return;
      }

      let raw: PythonAnalyzerOutput;
      try {
        raw = JSON.parse(stdout) as PythonAnalyzerOutput;
      } catch {
        reject(
          new Error(
            `Failed to parse audio analysis output as JSON: ${stdout.slice(0, 200)}`
          )
        );
        return;
      }

      resolve({
        detectedBpm: raw.bpm,
        bpmConfidence: raw.bpm_confidence,
        downbeatOffsetSeconds: raw.downbeat_offset_seconds,
        beatGrid: raw.beat_timestamps,
        beatGridFrames: raw.beat_frames,
        energyProfile: raw.energy_profile,
      });
    });
  });
}
