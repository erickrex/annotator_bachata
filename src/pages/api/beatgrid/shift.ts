// PUT /api/beatgrid/shift — Shift beat grid by offset, recompute cycles and clips.
// Requirements: 3.6

import type { APIRoute } from 'astro';
import { shiftBeatGrid, buildCycles } from '../../../services/cycle-builder.js';
import { createClips } from '../../../services/clip-manager.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../services/app-state.js';

export const PUT: APIRoute = async ({ request }) => {
  let body: { sourceId?: string; offsetMs?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { sourceId, offsetMs } = body;
  if (!sourceId || typeof sourceId !== 'string') {
    return errorResponse('Missing required field: sourceId');
  }
  if (offsetMs === undefined || typeof offsetMs !== 'number') {
    return errorResponse('Missing required field: offsetMs (number)');
  }

  const state = getAppState();
  const source = state.annotationService.getSource(sourceId);
  if (!source) {
    return errorResponse(`Source not found: ${sourceId}`, 404);
  }

  // Shift the beat grid
  const shifted = shiftBeatGrid(source.beat_grid, offsetMs, source.fps);
  source.beat_grid = shifted.timestamps;
  source.beat_grid_frames = shifted.frames;

  // Recompute downbeat index
  const downbeatIndex = shifted.timestamps.findIndex(
    (t) => Math.abs(t - source.downbeat_offset_seconds - offsetMs / 1000) < 0.05,
  );

  // Recompute cycles
  const cycles = buildCycles(
    shifted.frames,
    shifted.timestamps,
    Math.max(0, downbeatIndex),
  );
  state.cycles.set(sourceId, cycles);

  // Regenerate clips
  for (const [clipId, clip] of state.clips) {
    if (clip.sourceId === sourceId) {
      state.clips.delete(clipId);
    }
  }
  const newClips = createClips(sourceId, cycles, 16, source.fps);
  for (const clip of newClips) {
    state.clips.set(clip.clipId, clip);
  }

  autoSave();

  return jsonResponse({
    sourceId,
    offsetMs,
    cycleCount: cycles.cycles8.length,
    clipsGenerated: newClips.length,
  });
};
