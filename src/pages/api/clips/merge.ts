// POST /api/clips/merge — Merge two adjacent clips.
// Requirements: 5.7

import type { APIRoute } from 'astro';
import { mergeClips } from '../../../services/clip-manager.js';
import {
  getAppState,
  autoSave,
  jsonResponse,
  errorResponse,
  removeClip,
  upsertClip,
} from '../../../services/app-state.js';

export const POST: APIRoute = async ({ request }) => {
  let body: { clipIdA?: string; clipIdB?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { clipIdA, clipIdB } = body;
  if (!clipIdA || !clipIdB) {
    return errorResponse('Missing required fields: clipIdA, clipIdB');
  }

  const state = getAppState();
  let clipA = state.clips.get(clipIdA);
  let clipB = state.clips.get(clipIdB);

  if (!clipA) return errorResponse(`Clip not found: ${clipIdA}`, 404);
  if (!clipB) return errorResponse(`Clip not found: ${clipIdB}`, 404);

  const endA = clipA.remotion.fromFrame + clipA.remotion.durationInFrames;
  const endB = clipB.remotion.fromFrame + clipB.remotion.durationInFrames;
  if (endA !== clipB.remotion.fromFrame && endB === clipA.remotion.fromFrame) {
    [clipA, clipB] = [clipB, clipA];
  }

  // Verify adjacency: clipA's end should meet clipB's start
  if (clipA.remotion.fromFrame + clipA.remotion.durationInFrames !== clipB.remotion.fromFrame) {
    return errorResponse('Clips are not adjacent. clipA must end where clipB starts.');
  }

  const merged = mergeClips(clipA, clipB);
  const baseAnnotation =
    state.annotationService.getAnnotation(clipA.clipId) ??
    state.annotationService.getAnnotation(clipB.clipId);

  removeClip(clipA.clipId);
  removeClip(clipB.clipId);
  upsertClip(merged, baseAnnotation);

  autoSave();

  return jsonResponse({ merged });
};
