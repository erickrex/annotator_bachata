// POST /api/clips/:id/split — Split clip at frame.
// Requirements: 5.8

import type { APIRoute } from 'astro';
import { splitClip } from '../../../../services/clip-manager.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../../services/app-state.js';

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  let body: { splitAtFrame?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { splitAtFrame } = body;
  if (splitAtFrame === undefined || typeof splitAtFrame !== 'number') {
    return errorResponse('Missing required field: splitAtFrame (number)');
  }

  const state = getAppState();
  const clip = state.clips.get(id);
  if (!clip) {
    return errorResponse(`Clip not found: ${id}`, 404);
  }

  const cycles = state.cycles.get(clip.sourceId);
  if (!cycles) {
    return errorResponse(`No cycle data for source: ${clip.sourceId}`, 400);
  }

  const [clipA, clipB] = splitClip(clip, splitAtFrame, cycles);

  // Remove original, add two new clips
  state.clips.delete(id);
  state.clips.set(clipA.clipId, clipA);
  state.clips.set(clipB.clipId, clipB);

  autoSave();

  return jsonResponse({ clips: [clipA, clipB] });
};
