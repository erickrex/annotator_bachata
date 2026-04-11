// POST /api/clips/merge — Merge two adjacent clips.
// Requirements: 5.7

import type { APIRoute } from 'astro';
import { mergeClips } from '../../../services/clip-manager.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../services/app-state.js';

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
  const clipA = state.clips.get(clipIdA);
  const clipB = state.clips.get(clipIdB);

  if (!clipA) return errorResponse(`Clip not found: ${clipIdA}`, 404);
  if (!clipB) return errorResponse(`Clip not found: ${clipIdB}`, 404);

  // Verify adjacency: clipA's end should meet clipB's start
  const endA = clipA.remotion.fromFrame + clipA.remotion.durationInFrames;
  if (endA !== clipB.remotion.fromFrame) {
    return errorResponse('Clips are not adjacent. clipA must end where clipB starts.');
  }

  const merged = mergeClips(clipA, clipB);

  // Remove old clips, add merged
  state.clips.delete(clipIdA);
  state.clips.delete(clipIdB);
  state.clips.set(merged.clipId, merged);

  autoSave();

  return jsonResponse({ merged });
};
