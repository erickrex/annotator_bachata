// POST /api/analyze/:sourceId — Trigger audio analysis, return AudioAnalysisResult.
// Requirements: 2.1, 2.10, 2.11

import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { analyze } from '../../../services/audio-analysis-service.js';
import { buildCycles } from '../../../services/cycle-builder.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async ({ params }) => {
  const { sourceId } = params;
  if (!sourceId) {
    return errorResponse('Missing sourceId parameter', 400);
  }

  const state = getAppState();
  const source = state.annotationService.getSource(sourceId);
  if (!source) {
    return errorResponse(`Source not found: ${sourceId}`, 404);
  }

  const wavPath = join(state.projectDir, source.audio_file);

  try {
    const result = await analyze(wavPath, source.fps);

    // Store analysis result
    state.analysisResults.set(sourceId, result);

    // Update source record with analysis data
    source.detected_bpm = result.detectedBpm;
    source.bpm_confidence = result.bpmConfidence;
    source.downbeat_offset_seconds = result.downbeatOffsetSeconds;
    source.beat_grid = result.beatGrid;
    source.beat_grid_frames = result.beatGridFrames;
    source.energy_profile = result.energyProfile;

    // Build cycle hierarchy
    const downbeatIndex = result.beatGrid.findIndex(
      (t) => Math.abs(t - result.downbeatOffsetSeconds) < 0.05,
    );
    const cycles = buildCycles(
      result.beatGridFrames,
      result.beatGrid,
      Math.max(0, downbeatIndex),
    );
    state.cycles.set(sourceId, cycles);

    autoSave();

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Audio analysis failed: ${message}`, 500);
  }
};
