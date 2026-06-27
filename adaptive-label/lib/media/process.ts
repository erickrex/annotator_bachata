import { basename, extname, join } from "node:path";

import {
  createClip,
  createLabelingTask,
  createMediaJob,
  deleteClipsForMediaAsset,
  getActiveSchema,
  getMediaAssetById,
  listClipsForMediaAsset,
  updateMediaAsset,
  updateMediaJob,
  upsertAudioAnalysis,
  type ClipRow,
  type MediaAssetRow,
  type MediaJobRow,
} from "@/lib/db";
import { buildCycles } from "@/lib/domain/cycle-builder";
import { createClips } from "@/lib/domain/clip-manager";
import type { VirtualClipDef } from "@/lib/domain/types";
import { mediaAssetDir } from "@/lib/media/paths";
import { runProcess } from "@/lib/media/subprocess";
import type { BeatGridMetadata } from "@/lib/seed/types";

const FFPROBE_TIMEOUT_MS = 30_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const ANALYSIS_TIMEOUT_MS = 120_000;
const YTDLP_TIMEOUT_MS = 10 * 60_000;

export const DEFAULT_BEAT_COUNTS: Array<8 | 16 | 32> = [8, 16, 32];

interface FfprobeResult {
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface AnalyzerOutput {
  bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_timestamps: number[];
  beat_frames: number[];
  energy_profile: number[];
}

export interface ProcessMediaInput {
  mediaAssetId: string;
  jobId?: string;
  beatCounts?: Array<8 | 16 | 32>;
}

function failOnNonZero(
  label: string,
  result: { code: number | null; stderr: string; stdout: string },
): void {
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().slice(-1000);
    throw new Error(`${label} failed (exit ${result.code}): ${detail || "(no output)"}`);
  }
}

async function setJob(
  jobId: string | undefined,
  patch: Parameters<typeof updateMediaJob>[1],
): Promise<void> {
  if (jobId) await updateMediaJob(jobId, patch);
}

async function ffprobe(videoPath: string): Promise<FfprobeResult> {
  const result = await runProcess(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", videoPath],
    { timeoutMs: FFPROBE_TIMEOUT_MS, timeoutMessage: "ffprobe timed out" },
  );
  failOnNonZero("ffprobe", result);

  const data = JSON.parse(result.stdout) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  const stream = data.streams?.find((s) => s.codec_type === "video");
  if (!stream) throw new Error("No video stream found in ffprobe output");

  const [numRaw, denRaw] = (stream.r_frame_rate ?? "30/1").split("/");
  const num = Number(numRaw);
  const den = Number(denRaw);
  const fps = Number.isFinite(num) && Number.isFinite(den) && den > 0 ? num / den : 30;
  const durationSeconds = Number(data.format?.duration ?? stream.duration ?? 0);
  return {
    fps: Math.round(fps * 100) / 100,
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
  };
}

async function extractAudio(videoPath: string, wavPath: string): Promise<void> {
  const result = await runProcess(
    "ffmpeg",
    ["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", wavPath],
    {
      timeoutMs: FFMPEG_TIMEOUT_MS,
      timeoutMessage: `ffmpeg timed out extracting audio to ${wavPath}`,
    },
  );
  failOnNonZero("ffmpeg audio extraction", result);
}

export async function downloadYoutubeVideo(url: string, outputPath: string): Promise<void> {
  const result = await runProcess(
    "uv",
    [
      "run",
      "yt-dlp",
      "-f",
      "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "-o",
      outputPath,
      url,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: YTDLP_TIMEOUT_MS,
      timeoutMessage: "yt-dlp video download timed out",
    },
  );
  failOnNonZero("yt-dlp video download", result);
}

export async function analyzeAudio(wavPath: string, fps: number): Promise<AnalyzerOutput> {
  const result = await runProcess(
    "uv",
    ["run", "python", "-m", "analyzer.analyze", wavPath, "--fps", String(fps)],
    {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
      timeoutMessage: "audio analysis timed out",
    },
  );
  failOnNonZero("audio analysis", result);
  return JSON.parse(result.stdout) as AnalyzerOutput;
}

function downbeatIndex(output: AnalyzerOutput): number {
  if (output.beat_timestamps.length === 0) return 0;
  return output.beat_timestamps.reduce((best, timestamp, index) => {
    const bestDistance = Math.abs(output.beat_timestamps[best] - output.downbeat_offset_seconds);
    const currentDistance = Math.abs(timestamp - output.downbeat_offset_seconds);
    return currentDistance < bestDistance ? index : best;
  }, 0);
}

function metadataForClip(output: AnalyzerOutput, downbeat: number): BeatGridMetadata {
  return {
    timelineMode: "beat_grid",
    beatGrid: {
      bpm: output.bpm,
      bpm_confidence: output.bpm_confidence,
      downbeat_offset_seconds: output.downbeat_offset_seconds,
      beat_timestamps: output.beat_timestamps,
      beat_frames: output.beat_frames,
      energy_profile: output.energy_profile,
    },
    phrasing: {
      beatsPerCycle: 8,
      downbeatIndex: downbeat,
      countsPerPhrase16: 16,
      countsPerPhrase32: 32,
    },
    provenance: "analyzer",
  };
}

function clipTitle(clip: VirtualClipDef): string {
  return `${clip.beatCount}-count phrase C${clip.cycleNumber}`;
}

async function insertGeneratedClips(
  media: MediaAssetRow,
  output: AnalyzerOutput,
  beatCounts: Array<8 | 16 | 32>,
): Promise<ClipRow[]> {
  const schema = await getActiveSchema(media.project_id);
  if (!schema) {
    throw new Error("Project has no active schema; activate a schema before generating clips.");
  }
  if (schema.timeline_mode !== "beat_grid") {
    throw new Error("Runtime music analysis currently generates beat-grid clips only.");
  }

  const downbeat = downbeatIndex(output);
  const cycles = buildCycles(output.beat_frames, output.beat_timestamps, downbeat, 8);
  const metadata = metadataForClip(output, downbeat);
  const fps = Number(media.fps ?? 30);
  const inserted: ClipRow[] = [];
  let clipIndex = 1;

  for (const beatCount of beatCounts) {
    const virtualClips = createClips(media.id, cycles, beatCount, fps, output.beat_frames);
    for (const clip of virtualClips) {
      const startFrame = clip.remotion.fromFrame;
      const endFrame = startFrame + clip.remotion.durationInFrames - 1;
      const row = await createClip({
        projectId: media.project_id,
        mediaAssetId: media.id,
        clipIndex,
        title: clipTitle(clip),
        domain: "bachata",
        startFrame,
        endFrame,
        startSeconds: startFrame / fps,
        endSeconds: (endFrame + 1) / fps,
        metadata: {
          ...metadata,
          clip: {
            beatCount: clip.beatCount,
            cycleNumber: clip.cycleNumber,
            beatMarkerFrames: clip.beatMarkerFrames,
            remotion: clip.remotion,
          },
        },
        searchText: `bachata ${clipTitle(clip)} bpm ${output.bpm}`,
      });
      await createLabelingTask({
        projectId: media.project_id,
        clipId: row.id,
        schemaId: schema.id,
        status: "queued",
      });
      inserted.push(row);
      clipIndex += 1;
    }
  }

  return inserted;
}

export async function regenerateClipsForMedia(
  mediaAssetId: string,
  beatCounts: Array<8 | 16 | 32> = DEFAULT_BEAT_COUNTS,
): Promise<ClipRow[]> {
  const media = await getMediaAssetById(mediaAssetId);
  if (!media) throw new Error(`Media asset not found: ${mediaAssetId}`);
  const analysis = await import("@/lib/db").then((db) => db.getAudioAnalysisForMedia(mediaAssetId));
  if (!analysis) throw new Error(`No audio analysis found for media asset: ${mediaAssetId}`);

  await deleteClipsForMediaAsset(mediaAssetId);
  return insertGeneratedClips(
    media,
    {
      bpm: Number(analysis.detected_bpm),
      bpm_confidence: Number(analysis.bpm_confidence),
      downbeat_offset_seconds: Number(analysis.downbeat_offset_seconds),
      beat_timestamps: analysis.beat_grid_json,
      beat_frames: analysis.beat_grid_frames_json,
      energy_profile: analysis.energy_profile_json,
    },
    beatCounts,
  );
}

export async function processMediaAsset({
  mediaAssetId,
  jobId,
  beatCounts = DEFAULT_BEAT_COUNTS,
}: ProcessMediaInput): Promise<ClipRow[]> {
  const media = await getMediaAssetById(mediaAssetId);
  if (!media) throw new Error(`Media asset not found: ${mediaAssetId}`);

  try {
    await setJob(jobId, { status: "running", progress: 2, startedAt: new Date() });
    await updateMediaAsset(mediaAssetId, { status: "probing", errorMessage: null });

    let videoPath = media.local_video_path;
    if (!videoPath && media.source_type === "youtube" && media.original_url) {
      await updateMediaAsset(mediaAssetId, { status: "importing" });
      await setJob(jobId, { progress: 10 });
      const dir = mediaAssetDir(media.project_id, media.id);
      videoPath = join(dir, "source.mp4");
      await downloadYoutubeVideo(media.original_url, videoPath);
      await updateMediaAsset(mediaAssetId, {
        localVideoPath: videoPath,
        metadata: { ...media.metadata_json, originalFilename: basename(videoPath) },
      });
    }
    if (!videoPath) throw new Error("Media asset has no local video path.");

    const probe = await ffprobe(videoPath);
    await updateMediaAsset(mediaAssetId, {
      durationSeconds: probe.durationSeconds,
      fps: probe.fps,
      width: probe.width,
      height: probe.height,
    });
    await setJob(jobId, { progress: 25 });

    await updateMediaAsset(mediaAssetId, { status: "extracting_audio" });
    const audioPath =
      media.local_audio_path ??
      join(mediaAssetDir(media.project_id, media.id), `${basename(videoPath, extname(videoPath))}.wav`);
    await extractAudio(videoPath, audioPath);
    await updateMediaAsset(mediaAssetId, { localAudioPath: audioPath });
    await setJob(jobId, { progress: 45 });

    await updateMediaAsset(mediaAssetId, { status: "analyzing" });
    const output = await analyzeAudio(audioPath, probe.fps);
    await upsertAudioAnalysis({
      mediaAssetId,
      detectedBpm: output.bpm,
      bpmConfidence: output.bpm_confidence,
      downbeatOffsetSeconds: output.downbeat_offset_seconds,
      beatGrid: output.beat_timestamps,
      beatGridFrames: output.beat_frames,
      energyProfile: output.energy_profile,
    });
    await setJob(jobId, { progress: 70 });

    await updateMediaAsset(mediaAssetId, { status: "generating_clips" });
    await deleteClipsForMediaAsset(mediaAssetId);
    const freshMedia = (await getMediaAssetById(mediaAssetId)) ?? media;
    const clips = await insertGeneratedClips(freshMedia, output, beatCounts);

    await updateMediaAsset(mediaAssetId, { status: "ready", errorMessage: null });
    await setJob(jobId, {
      status: "succeeded",
      progress: 100,
      completedAt: new Date(),
      errorMessage: null,
    });
    return clips;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateMediaAsset(mediaAssetId, { status: "failed", errorMessage: message });
    await setJob(jobId, {
      status: "failed",
      progress: 100,
      completedAt: new Date(),
      errorMessage: message,
    });
    throw error;
  }
}

export function startMediaProcessing(input: ProcessMediaInput): void {
  void processMediaAsset(input).catch((error) => {
    console.error("Runtime media processing failed", error);
  });
}

export async function createProcessingJob(media: MediaAssetRow): Promise<MediaJobRow> {
  return createMediaJob({
    projectId: media.project_id,
    mediaAssetId: media.id,
    type: "analyze_media",
    status: "queued",
    progress: 0,
  });
}

export async function clipCountForMedia(mediaAssetId: string): Promise<number> {
  return (await listClipsForMediaAsset(mediaAssetId)).length;
}
