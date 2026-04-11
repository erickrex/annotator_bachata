// PUT /api/beatgrid/downbeat — Set new downbeat index, recompute cycles and clips.
// Requirements: 3.5

import type { APIRoute } from 'astro';
import { recomputeWithDownbeat } from '../../../services/cycle-builder.js';
import { createClips } from '../../../services/clip-manager.js';
import {
  getAppState,
  autoSave,
  jsonResponse,
  errorResponse,
  replaceClipsForSource,
} from '../../../services/app-state.js';

export const PUT: APIRoute = async ({ request }) => {
  let body: { sourceId?: string; downbeatIndex?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { sourceId, downbeatIndex } = body;
  if (!sourceId || typeof sourceId !== 'string') {
    return errorResponse('Missing required field: sourceId');
  }
  if (downbeatIndex === undefined || typeof downbeatIndex !== 'number') {
    return errorResponse('Missing required field: downbeatIndex (number)');
  }

  const state = getAppState();
  const source = state.annotationService.getSource(sourceId);
  if (!source) {
    return errorResponse(`Source not found: ${sourceId}`, 404);
  }

  if (downbeatIndex < 0 || downbeatIndex >= source.beat_grid.length) {
    return errorResponse(
      `downbeatIndex out of range. Must be 0–${source.beat_grid.length - 1}`,
    );
  }

  // Update source downbeat offset
  source.downbeat_offset_seconds = source.beat_grid[downbeatIndex];

  // Recompute cycles
  const cycles = recomputeWithDownbeat(
    source.beat_grid_frames,
    source.beat_grid,
    downbeatIndex,
  );
  state.cycles.set(sourceId, cycles);

  const beatCount =
    Array.from(state.clips.values()).find((clip) => clip.sourceId === sourceId)?.beatCount ?? 16;
  const newClips = createClips(
    sourceId,
    cycles,
    beatCount as 8 | 16 | 32,
    source.fps,
    source.beat_grid_frames,
  );
  replaceClipsForSource(sourceId, newClips);

  autoSave();

  return jsonResponse({
    sourceId,
    downbeatIndex,
    cycleCount: cycles.cycles8.length,
    clipsGenerated: newClips.length,
  });
};
