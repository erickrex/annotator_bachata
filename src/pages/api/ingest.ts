// POST /api/ingest — Download YouTube video, stream SSE progress, return SourceMetadata.
// Requirements: 1.1, 1.3, 1.6, 1.7

import type { APIRoute } from 'astro';
import { download, validateUrl } from '../../services/ingestion-service.js';
import { getAppState, autoSave } from '../../services/app-state.js';

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = body.url;
  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing required field: url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validation = validateUrl(url);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: `Invalid YouTube URL: ${url}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = getAppState();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = download(url, state.projectDir);
        let result = await gen.next();

        // Yield progress events
        while (!result.done) {
          const event = `data: ${JSON.stringify({ type: 'progress', ...result.value })}\n\n`;
          controller.enqueue(encoder.encode(event));
          result = await gen.next();
        }

        // result.value is the SourceMetadata
        const metadata = result.value;

        // Store source metadata in app state
        state.sourceMetadata.set(metadata.sourceId, metadata);
        state.annotationService.addSource({
          source_id: metadata.sourceId,
          youtube_url: metadata.youtubeUrl,
          title: metadata.title,
          channel: metadata.channel,
          upload_date: metadata.uploadDate,
          duration_seconds: metadata.durationSeconds,
          fps: metadata.fps,
          width: metadata.width,
          height: metadata.height,
          total_frames: metadata.totalFrames,
          video_file: metadata.videoFile,
          audio_file: metadata.audioFile,
          detected_bpm: 0,
          bpm_confidence: 0,
          downbeat_offset_seconds: 0,
          beat_grid: [],
          beat_grid_frames: [],
          energy_profile: [],
          downloaded_at: metadata.downloadedAt,
        });

        autoSave();

        const doneEvent = `data: ${JSON.stringify({ type: 'complete', metadata })}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorEvent = `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
