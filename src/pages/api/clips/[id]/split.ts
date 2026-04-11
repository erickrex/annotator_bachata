// POST /api/clips/:id/split — Split clip at frame.
// Requirements: 5.8

import type { APIRoute } from 'astro';
import { splitClip } from '../../../../services/clip-manager.js';
import {
  getAppState,
  autoSave,
  jsonResponse,
  errorResponse,
  removeClip,
  upsertClip,
} from '../../../../services/app-state.js';

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
  if (clip.beatCount <= 8) {
    return errorResponse('Clip must contain at least two cycles to split.', 400);
  }

  const cycles = state.cycles.get(clip.sourceId);
  if (!cycles) {
    return errorResponse(`No cycle data for source: ${clip.sourceId}`, 400);
  }

  let clipA;
  let clipB;
  try {
    [clipA, clipB] = splitClip(clip, clip.remotion.fromFrame + splitAtFrame, cycles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(message, 400);
  }

  const baseAnnotation = state.annotationService.getAnnotation(id);
  removeClip(id);
  upsertClip(clipA, baseAnnotation);
  upsertClip(clipB, baseAnnotation);

  autoSave();

  return jsonResponse({ clips: [clipA, clipB] });
};
