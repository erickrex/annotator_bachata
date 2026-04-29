// PUT /api/clips/:id/trim — Update in/out points for a clip.
// These are metadata-only changes within the extracted file's handle range.

import type { APIRoute } from 'astro';
import {
  getAppState,
  autoSave,
  jsonResponse,
  errorResponse,
} from '../../../../services/app-state.js';

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  let body: { inPoint?: number; outPoint?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const state = getAppState();
  const clip = state.clips.get(id);
  if (!clip) {
    return errorResponse(`Clip not found: ${id}`, 404);
  }

  if (!clip.extractedFile) {
    return errorResponse('Clip has no extracted file — cannot adjust trim points', 400);
  }

  const handleBefore = clip.handleBefore ?? 0;
  const handleAfter = clip.handleAfter ?? 0;
  const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
  const totalExtracted = handleBefore + clipDuration + handleAfter;

  if (body.inPoint !== undefined) {
    if (body.inPoint < 0 || body.inPoint >= totalExtracted) {
      return errorResponse(`inPoint must be between 0 and ${totalExtracted.toFixed(3)}`);
    }
    clip.inPoint = body.inPoint;
  }

  if (body.outPoint !== undefined) {
    if (body.outPoint <= 0 || body.outPoint > totalExtracted) {
      return errorResponse(`outPoint must be between 0 and ${totalExtracted.toFixed(3)}`);
    }
    clip.outPoint = body.outPoint;
  }

  // Validate in < out
  const inPt = clip.inPoint ?? handleBefore;
  const outPt = clip.outPoint ?? (handleBefore + clipDuration);
  if (inPt >= outPt) {
    return errorResponse('inPoint must be less than outPoint');
  }

  autoSave();

  return jsonResponse({ clip });
};
