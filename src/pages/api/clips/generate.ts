// POST /api/clips/generate — Generate virtual clips from cycles and extract preview MP4s.
// Requirements: 4.1, 4.2

import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { buildCycles } from '../../../services/cycle-builder.js';
import { createClips } from '../../../services/clip-manager.js';
import { extractAllClips, DEFAULT_HANDLE_SECONDS } from '../../../services/clip-extraction-service.js';
import {
  getAppState,
  autoSave,
  jsonResponse,
  errorResponse,
  replaceClipsForSource,
} from '../../../services/app-state.js';

export const POST: APIRoute = async ({ request }) => {
  let body: { sourceId?: string; beatCount?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { sourceId, beatCount } = body;
  if (!sourceId || typeof sourceId !== 'string') {
    return errorResponse('Missing required field: sourceId');
  }

  const validBeatCounts = [4, 8, 16, 32] as const;
  const bc = (beatCount ?? 8) as 4 | 8 | 16 | 32;
  if (!validBeatCounts.includes(bc)) {
    return errorResponse('beatCount must be 4, 8, 16, or 32');
  }

  const state = getAppState();
  const source = state.annotationService.getSource(sourceId);
  if (!source) {
    return errorResponse(`Source not found: ${sourceId}`, 404);
  }

  const cycles = state.cycles.get(sourceId);
  if (!cycles) {
    return errorResponse(`No cycle data for source: ${sourceId}. Run analysis first.`, 400);
  }

  // Rebuild cycles at the requested beat count
  const cyclesForBeatCount = buildCycles(
    source.beat_grid_frames,
    source.beat_grid,
    0, // downbeat index
    bc,
  );

  const clips = createClips(sourceId, cyclesForBeatCount, bc, source.fps, source.beat_grid_frames);

  // Extract each clip as its own MP4 with handles for boundary adjustment
  const projectDir = state.projectDir;
  const sourceVideoPath = join(projectDir, source.video_file);
  const sourceAudioPath = source.audio_file ? join(projectDir, source.audio_file) : undefined;
  const clipsDir = join(projectDir, 'sources', 'clips', sourceId);

  for await (const result of extractAllClips(
    clips,
    sourceVideoPath,
    sourceAudioPath,
    clipsDir,
    source.duration_seconds,
    DEFAULT_HANDLE_SECONDS,
  )) {
    const clip = clips.find((c) => c.clipId === result.clipId);
    if (clip) {
      clip.extractedFile = `sources/clips/${sourceId}/${result.clipId}.mp4`;
      clip.handleBefore = result.handleBefore;
      clip.handleAfter = result.handleAfter;
      clip.inPoint = result.handleBefore;
      clip.outPoint = result.handleBefore + clip.remotion.durationInFrames / clip.remotion.fps;
    }
  }

  replaceClipsForSource(sourceId, clips);
  autoSave();

  return jsonResponse({ clips, count: clips.length });
};
