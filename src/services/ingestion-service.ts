/**
 * Ingestion Service — downloads YouTube videos via yt-dlp and extracts metadata via ffprobe.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 15.1, 16.7
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownloadProgress, SourceMetadata } from '../types/index.js';
import { validateUrl } from './url-validator.js';

/** Timeout for the download process (5 minutes). */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** Timeout for ffprobe metadata extraction (30 seconds). */
const FFPROBE_TIMEOUT_MS = 30 * 1000;

// yt-dlp progress line pattern:
// [download]  45.2% of ~123.45MiB at 1.23MiB/s ETA 00:42
const PROGRESS_RE =
  /\[download\]\s+([\d.]+)%\s+of\s+~?[\d.]+\S*\s+at\s+(\S+)\s+ETA\s+(\S+)/;

// ---------------------------------------------------------------------------
// ffprobe helpers
// ---------------------------------------------------------------------------

interface FfprobeResult {
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  totalFrames: number;
}

interface YtDlpInfo {
  title: string;
  channel: string;
  uploadDate: string;
}

/**
 * Run ffprobe on a video file and extract stream/format metadata.
 */
async function ffprobe(videoPath: string): Promise<FfprobeResult> {
  return new Promise<FfprobeResult>((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ]);

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffprobe timed out'));
    }, FFPROBE_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffprobe failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        const data = JSON.parse(stdout) as {
          streams?: Array<{
            codec_type?: string;
            width?: number;
            height?: number;
            r_frame_rate?: string;
            nb_frames?: string;
            duration?: string;
          }>;
          format?: { duration?: string };
        };

        const videoStream = data.streams?.find((s) => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found in ffprobe output'));
          return;
        }

        // Parse frame rate from "30000/1001" or "30/1" format
        let fps = 30;
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2) {
            const num = Number(parts[0]);
            const den = Number(parts[1]);
            if (den > 0) fps = num / den;
          } else {
            const parsed = Number(videoStream.r_frame_rate);
            if (!Number.isNaN(parsed) && parsed > 0) fps = parsed;
          }
        }

        const width = videoStream.width ?? 0;
        const height = videoStream.height ?? 0;

        // Duration: prefer format-level, fall back to stream-level
        const durationStr = data.format?.duration ?? videoStream.duration ?? '0';
        const durationSeconds = Number.parseFloat(durationStr) || 0;

        // Total frames: prefer nb_frames, fall back to fps * duration
        let totalFrames = 0;
        if (videoStream.nb_frames && videoStream.nb_frames !== 'N/A') {
          totalFrames = Number.parseInt(videoStream.nb_frames, 10) || 0;
        }
        if (totalFrames === 0) {
          totalFrames = Math.round(fps * durationSeconds);
        }

        resolve({ fps: Math.round(fps * 100) / 100, width, height, durationSeconds, totalFrames });
      } catch (err) {
        reject(new Error(`Failed to parse ffprobe output: ${(err as Error).message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// yt-dlp metadata helper
// ---------------------------------------------------------------------------

/**
 * Fetch video metadata (title, channel, upload date) via yt-dlp --dump-json.
 */
async function fetchVideoInfo(url: string): Promise<YtDlpInfo> {
  return new Promise<YtDlpInfo>((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--dump-json', '--no-download', url]);

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('yt-dlp metadata fetch timed out'));
    }, FFPROBE_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = stderr.trim();
        // Detect specific error types for better user messages
        if (msg.includes('age-restricted') || msg.includes('Sign in to confirm your age')) {
          reject(new Error(`Video is age-restricted and cannot be downloaded: ${msg}`));
        } else if (msg.includes('Private video') || msg.includes('private video')) {
          reject(new Error(`Video is private and cannot be accessed: ${msg}`));
        } else if (msg.includes('Video unavailable') || msg.includes('not available')) {
          reject(new Error(`Video is unavailable: ${msg}`));
        } else {
          reject(new Error(`yt-dlp metadata failed (exit ${code}): ${msg}`));
        }
        return;
      }

      try {
        const info = JSON.parse(stdout) as {
          title?: string;
          uploader?: string;
          channel?: string;
          upload_date?: string;
        };

        // upload_date comes as "YYYYMMDD" — convert to ISO-ish "YYYY-MM-DD"
        let uploadDate = info.upload_date ?? '';
        if (uploadDate.length === 8) {
          uploadDate = `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
        }

        resolve({
          title: info.title ?? 'Unknown',
          channel: info.channel ?? info.uploader ?? 'Unknown',
          uploadDate,
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp JSON: ${(err as Error).message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

/**
 * Spawn yt-dlp to download video as MP4 (best quality ≤ 1080p).
 * Yields DownloadProgress events parsed from stderr.
 * Resolves when the process exits successfully.
 */
function downloadVideo(
  url: string,
  outputPath: string,
): { progress: AsyncGenerator<DownloadProgress, void>; done: Promise<void> } {
  const proc = spawn('yt-dlp', [
    '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '--merge-output-format', 'mp4',
    '--progress',
    '--newline',
    '-o', outputPath,
    url,
  ]);

  let stderr = '';
  let rejectFn: ((err: Error) => void) | undefined;

  const timer = setTimeout(() => {
    proc.kill('SIGKILL');
    rejectFn?.(new Error('Video download timed out after 5 minutes'));
  }, DOWNLOAD_TIMEOUT_MS);

  // Collect progress lines from stderr
  const progressLines: string[] = [];
  let progressResolve: (() => void) | undefined;
  let processExited = false;

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    // yt-dlp writes progress to stderr, one line per update when --newline is used
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      progressLines.push(line);
    }
    progressResolve?.();
  });

  proc.on('error', (err) => {
    clearTimeout(timer);
    processExited = true;
    rejectFn?.(new Error(`yt-dlp failed to start: ${err.message}`));
    progressResolve?.();
  });

  const donePromise = new Promise<void>((resolve, reject) => {
    rejectFn = reject;
    proc.on('close', (code) => {
      clearTimeout(timer);
      processExited = true;
      progressResolve?.();

      if (code !== 0) {
        const msg = stderr.trim();
        if (msg.includes('age-restricted') || msg.includes('Sign in to confirm your age')) {
          reject(new Error(`Video is age-restricted and cannot be downloaded: ${msg}`));
        } else if (msg.includes('Private video') || msg.includes('private video')) {
          reject(new Error(`Video is private and cannot be accessed: ${msg}`));
        } else if (msg.includes('Video unavailable') || msg.includes('not available')) {
          reject(new Error(`Video is unavailable: ${msg}`));
        } else {
          reject(new Error(`yt-dlp download failed (exit ${code}): ${msg}`));
        }
      } else {
        resolve();
      }
    });
  });

  async function* progressGenerator(): AsyncGenerator<DownloadProgress, void> {
    let cursor = 0;
    while (!processExited || cursor < progressLines.length) {
      if (cursor >= progressLines.length) {
        // Wait for more data
        await new Promise<void>((r) => { progressResolve = r; });
        continue;
      }

      const line = progressLines[cursor++];
      const match = line.match(PROGRESS_RE);
      if (match) {
        yield {
          percent: Number.parseFloat(match[1]),
          speed: match[2],
          eta: match[3],
        };
      }
    }
  }

  return { progress: progressGenerator(), done: donePromise };
}

/**
 * Spawn yt-dlp to extract audio as WAV.
 */
async function extractAudio(url: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'wav',
      '-o', outputPath,
      url,
    ]);

    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Audio extraction timed out'));
    }, DOWNLOAD_TIMEOUT_MS);

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp audio extraction failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`yt-dlp audio extraction failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download a YouTube video and extract audio, yielding progress events.
 * Returns SourceMetadata on completion.
 */
export async function* download(
  url: string,
  outputDir: string,
): AsyncGenerator<DownloadProgress, SourceMetadata> {
  // 1. Validate URL
  const validation = validateUrl(url);
  if (!validation.valid || !validation.videoId) {
    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  const videoId = validation.videoId;
  const sourceId = `yt_${videoId}`;
  const sourcesDir = join(outputDir, 'sources');

  // Ensure output directory exists
  await mkdir(sourcesDir, { recursive: true });

  const videoFile = join(sourcesDir, `${sourceId}.mp4`);
  const audioFile = join(sourcesDir, `${sourceId}.wav`);

  // 2. Fetch video info (title, channel, upload date)
  const info = await fetchVideoInfo(url);

  // 3. Download video with progress tracking
  const { progress, done } = downloadVideo(url, videoFile);

  // Yield progress events as they arrive
  for await (const event of progress) {
    yield event;
  }

  // Wait for the download process to fully complete (may throw on error)
  await done;

  // 4. Extract audio as WAV
  await extractAudio(url, audioFile);

  // 5. Read video metadata via ffprobe
  const meta = await ffprobe(videoFile);

  // 6. Build and return SourceMetadata
  const sourceMetadata: SourceMetadata = {
    sourceId,
    youtubeUrl: url,
    title: info.title,
    channel: info.channel,
    uploadDate: info.uploadDate,
    durationSeconds: meta.durationSeconds,
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    totalFrames: meta.totalFrames,
    videoFile: `sources/${sourceId}.mp4`,
    audioFile: `sources/${sourceId}.wav`,
    downloadedAt: new Date().toISOString(),
  };

  return sourceMetadata;
}

export { validateUrl };
