/**
 * Ingestion Service — downloads YouTube videos via yt-dlp (run with `uv` from pyproject.toml)
 * and extracts metadata via ffprobe.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownloadProgress, SourceMetadata } from '../types/index.js';
import { validateUrl } from './url-validator.js';
import { runProcess } from './process-utils.js';

/** Project root for `uv run` so pyproject.toml / uv.lock resolve (matches app-state projectDir). */
function projectRoot(): string {
  return process.env.PROJECT_DIR ?? process.cwd();
}

/**
 * Spawn yt-dlp from the uv-managed environment declared in pyproject.toml.
 * Avoids relying on a global `yt-dlp` on PATH (e.g. Cursor’s embedded browser / minimal PATH).
 */
function spawnYtDlp(args: string[]) {
  return spawn('uv', ['run', 'yt-dlp', ...args], {
    cwd: projectRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Timeout for the download process (10 minutes). */
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** Timeout for ffprobe metadata extraction (30 seconds). */
const FFPROBE_TIMEOUT_MS = 30 * 1000;

/** Timeout for yt-dlp metadata fetch (120 seconds — YouTube negotiation can be slow). */
const YTDLP_METADATA_TIMEOUT_MS = 120 * 1000;

// yt-dlp progress line pattern:
// [download]  45.2% of ~123.45MiB at 1.23MiB/s ETA 00:42
const PROGRESS_RE =
  /\[download\]\s+([\d.]+)%\s+of\s+~?[\d.]+\S*\s+at\s+(\S+)\s+ETA\s+(\S+)/;

/**
 * Classify a yt-dlp failure message into a user-facing Error.
 *
 * Shared by the metadata fetch and download paths so both surface identical
 * messages for age-restricted / private / unavailable videos. The fallback
 * message is parameterized via `fallbackLabel` ('metadata' or 'download') so
 * each caller keeps its original wording.
 */
function classifyYtDlpError(message: string, code: number | null, fallbackLabel: string): Error {
  if (message.includes('age-restricted') || message.includes('Sign in to confirm your age')) {
    return new Error(`Video is age-restricted and cannot be downloaded: ${message}`);
  } else if (message.includes('Private video') || message.includes('private video')) {
    return new Error(`Video is private and cannot be accessed: ${message}`);
  } else if (message.includes('Video unavailable') || message.includes('not available')) {
    return new Error(`Video is unavailable: ${message}`);
  } else {
    return new Error(`yt-dlp ${fallbackLabel} failed (exit ${code}): ${message}`);
  }
}

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
  console.log(`[ingest] ffprobe: starting for ${videoPath}`);

  let stdout: string;
  let stderr: string;
  let code: number | null;
  try {
    ({ stdout, stderr, code } = await runProcess(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath,
      ],
      {
        timeoutMs: FFPROBE_TIMEOUT_MS,
        timeoutMessage: 'ffprobe timed out',
      },
    ));
  } catch (err) {
    const message = (err as Error).message;
    // The timeout rejection already carries the exact desired message; re-throw
    // as-is. Only spawn errors get the caller-specific "failed to start" prefix.
    if (message === 'ffprobe timed out') {
      console.error('[ingest] ffprobe: timed out');
      throw err;
    }
    console.error(`[ingest] ffprobe: failed to start — ${message}`);
    throw new Error(`ffprobe failed to start: ${message}`);
  }

  console.log(`[ingest] ffprobe: exited with code ${code}`);
  if (code !== 0) {
    throw new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`);
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
      throw new Error('No video stream found in ffprobe output');
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

    return { fps: Math.round(fps * 100) / 100, width, height, durationSeconds, totalFrames };
  } catch (err) {
    // Preserve the original "No video stream found" message verbatim; wrap any
    // other parse failure the same way the original close handler did.
    if (err instanceof Error && err.message === 'No video stream found in ffprobe output') {
      throw err;
    }
    throw new Error(`Failed to parse ffprobe output: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// yt-dlp metadata helper
// ---------------------------------------------------------------------------

/**
 * Fetch video metadata (title, channel, upload date) via yt-dlp --dump-json.
 */
async function fetchVideoInfo(url: string): Promise<YtDlpInfo> {
  console.log(`[ingest] fetchVideoInfo: starting for ${url}`);

  let stdout: string;
  let stderr: string;
  let code: number | null;
  try {
    ({ stdout, stderr, code } = await runProcess(
      'uv',
      ['run', 'yt-dlp', '--dump-json', '--no-download', '--no-playlist', '--socket-timeout', '30', url],
      {
        cwd: projectRoot(),
        env: process.env,
        timeoutMs: YTDLP_METADATA_TIMEOUT_MS,
        timeoutMessage: 'yt-dlp metadata fetch timed out',
      },
    ));
  } catch (err) {
    const message = (err as Error).message;
    // The timeout rejection already carries the exact desired message; re-throw
    // as-is. Only spawn errors get the caller-specific "failed to start" prefix.
    if (message === 'yt-dlp metadata fetch timed out') {
      console.error(`[ingest] fetchVideoInfo: timed out after ${YTDLP_METADATA_TIMEOUT_MS / 1000}s`);
      throw err;
    }
    console.error(`[ingest] fetchVideoInfo: failed to start — ${message}`);
    throw new Error(`uv run yt-dlp failed to start: ${message}`);
  }

  const trimmedStderr = stderr.trim();
  if (trimmedStderr) {
    console.log(`[ingest] fetchVideoInfo stderr: ${trimmedStderr}`);
  }

  console.log(`[ingest] fetchVideoInfo: exited with code ${code}`);
  if (code !== 0) {
    const msg = stderr.trim();
    // Detect specific error types for better user messages
    throw classifyYtDlpError(msg, code, 'metadata');
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

    const result: YtDlpInfo = {
      title: info.title ?? 'Unknown',
      channel: info.channel ?? info.uploader ?? 'Unknown',
      uploadDate,
    };
    console.log(`[ingest] fetchVideoInfo: success — "${info.title}" by ${info.channel ?? info.uploader}`);
    return result;
  } catch (err) {
    console.error(`[ingest] fetchVideoInfo: JSON parse failed — ${(err as Error).message}`);
    throw new Error(`Failed to parse yt-dlp JSON: ${(err as Error).message}`);
  }
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
  console.log(`[ingest] downloadVideo: starting — ${url} → ${outputPath}`);
  const proc = spawnYtDlp([
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
    console.error('[ingest] downloadVideo: timed out after 5 minutes');
    rejectFn?.(new Error('Video download timed out after 5 minutes'));
  }, DOWNLOAD_TIMEOUT_MS);

  // Collect progress lines from stdout (yt-dlp writes all output to stdout)
  const progressLines: string[] = [];
  let progressResolve: (() => void) | undefined;
  let processExited = false;

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      progressLines.push(line);
    }
    progressResolve?.();
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on('error', (err) => {
    clearTimeout(timer);
    processExited = true;
    console.error(`[ingest] downloadVideo: failed to start — ${err.message}`);
    rejectFn?.(new Error(`uv run yt-dlp failed to start: ${err.message}`));
    progressResolve?.();
  });

  const donePromise = new Promise<void>((resolve, reject) => {
    rejectFn = reject;
    proc.on('close', (code) => {
      clearTimeout(timer);
      processExited = true;
      progressResolve?.();
      console.log(`[ingest] downloadVideo: exited with code ${code}`);

      if (code !== 0) {
        const msg = (stderr.trim() || progressLines.join('\n')).trim();
        reject(classifyYtDlpError(msg, code, 'download'));
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

  // Prevent unhandled rejection if timeout fires before the caller awaits donePromise
  donePromise.catch(() => {});

  return { progress: progressGenerator(), done: donePromise };
}

/**
 * Spawn yt-dlp to extract audio as WAV.
 */
async function extractAudio(url: string, outputPath: string): Promise<void> {
  console.log(`[ingest] extractAudio: starting — ${url} → ${outputPath}`);

  let stdout: string;
  let stderr: string;
  let code: number | null;
  try {
    ({ stdout, stderr, code } = await runProcess(
      'uv',
      ['run', 'yt-dlp', '-x', '--audio-format', 'wav', '-o', outputPath, url],
      {
        cwd: projectRoot(),
        env: process.env,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        timeoutMessage: 'Audio extraction timed out',
      },
    ));
  } catch (err) {
    const message = (err as Error).message;
    // The timeout rejection already carries the exact desired message; re-throw
    // as-is. Only spawn errors get the caller-specific "failed to start" prefix.
    if (message === 'Audio extraction timed out') {
      console.error('[ingest] extractAudio: timed out');
      throw err;
    }
    console.error(`[ingest] extractAudio: failed to start — ${message}`);
    throw new Error(`uv run yt-dlp audio extraction failed to start: ${message}`);
  }

  console.log(`[ingest] extractAudio: exited with code ${code}`);
  if (code !== 0) {
    throw new Error(`yt-dlp audio extraction failed (exit ${code}): ${(stderr || stdout).trim()}`);
  }
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
  console.log(`[ingest] download: pipeline starting — url=${url} dir=${outputDir}`);

  // 1. Validate URL
  const validation = validateUrl(url);
  if (!validation.valid || !validation.videoId) {
    console.error(`[ingest] download: invalid URL — ${url}`);
    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  const videoId = validation.videoId;
  const sourceId = `yt_${videoId}`;
  const sourcesDir = join(outputDir, 'sources');

  console.log(`[ingest] download: videoId=${videoId} sourceId=${sourceId}`);

  // Ensure output directory exists
  await mkdir(sourcesDir, { recursive: true });

  const videoFile = join(sourcesDir, `${sourceId}.mp4`);
  const audioFile = join(sourcesDir, `${sourceId}.wav`);

  // 2. Fetch video info (title, channel, upload date)
  console.log('[ingest] download: step 2 — fetching video info');
  const info = await fetchVideoInfo(url);

  // 3. Download video with progress tracking
  console.log('[ingest] download: step 3 — downloading video');
  const { progress, done } = downloadVideo(url, videoFile);

  // Yield progress events as they arrive
  for await (const event of progress) {
    yield event;
  }

  // Wait for the download process to fully complete (may throw on error)
  await done;
  console.log('[ingest] download: step 3 complete — video downloaded');

  // 4. Extract audio as WAV
  console.log('[ingest] download: step 4 — extracting audio');
  await extractAudio(url, audioFile);
  console.log('[ingest] download: step 4 complete — audio extracted');

  // 5. Read video metadata via ffprobe
  console.log('[ingest] download: step 5 — running ffprobe');
  const meta = await ffprobe(videoFile);
  console.log(`[ingest] download: step 5 complete — ${meta.width}x${meta.height} ${meta.fps}fps ${meta.durationSeconds}s`);

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
