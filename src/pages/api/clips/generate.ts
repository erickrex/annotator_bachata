// POST /api/clips/generate — Generate virtual clips from cycles.
// Requirements: 4.1, 4.2

import type { APIRoute } from 'astro';
import { createClips } from '../../../services/clip-manager.js';
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

  const validBeatCounts = [8, 16, 32] as const;
  const bc = (beatCount ?? 16) as 8 | 16 | 32;
  if (!validBeatCounts.includes(bc)) {
    return errorResponse('beatCount must be 8, 16, or 32');
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

  const clips = createClips(sourceId, cycles, bc, source.fps, source.beat_grid_frames);
  replaceClipsForSource(sourceId, clips);

  autoSave();

  return jsonResponse({ clips, count: clips.length });
};
