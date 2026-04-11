// GET /api/clips — List all clips with status, completeness, and annotations.
// Requirements: 5.2

import type { APIRoute } from 'astro';
import { getAppState, jsonResponse } from '../../../services/app-state.js';

export const GET: APIRoute = async () => {
  const state = getAppState();
  const clips = Array.from(state.clips.values())
    .sort((a, b) => (
      a.remotion.fromFrame - b.remotion.fromFrame ||
      a.cycleNumber - b.cycleNumber ||
      a.beatCount - b.beatCount ||
      a.clipId.localeCompare(b.clipId)
    ))
    .map((clip) => {
    const annotation = state.annotationService.getAnnotation(clip.clipId);
    const completeness = annotation
      ? state.annotationService.calculateCompleteness(annotation)
      : 0;

    return {
      ...clip,
      completeness,
    };
    });

  // Also return annotations so the review page can display them
  const annotations = clips
    .map((clip) => state.annotationService.getAnnotation(clip.clipId))
    .filter((a) => a !== null);

  // Return sources so the review page can resolve video paths
  const sourceIds = new Set(clips.map((c) => c.sourceId));
  const sources = Array.from(sourceIds)
    .map((id) => state.annotationService.getSource(id))
    .filter((s) => s !== undefined);

  return jsonResponse({ clips, annotations, sources, count: clips.length });
};
