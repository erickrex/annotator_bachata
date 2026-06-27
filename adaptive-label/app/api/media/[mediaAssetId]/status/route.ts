import {
  getAudioAnalysisForMedia,
  getMediaAssetById,
  listMediaJobsForAsset,
} from "@/lib/db";
import { clipCountForMedia } from "@/lib/media/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await context.params;
  const mediaAsset = await getMediaAssetById(mediaAssetId);
  if (!mediaAsset) {
    return Response.json(
      { error: `Media asset ${mediaAssetId} not found.` },
      { status: 404 },
    );
  }

  const [jobs, analysis, generatedClipCount] = await Promise.all([
    listMediaJobsForAsset(mediaAssetId),
    getAudioAnalysisForMedia(mediaAssetId),
    clipCountForMedia(mediaAssetId),
  ]);

  return Response.json({
    mediaAsset,
    latestJob: jobs[0] ?? null,
    jobs,
    analysis: analysis
      ? {
          bpm: Number(analysis.detected_bpm),
          confidence: Number(analysis.bpm_confidence),
          downbeatOffsetSeconds: Number(analysis.downbeat_offset_seconds),
          beatCount: analysis.beat_grid_json.length,
          energyPointCount: analysis.energy_profile_json.length,
        }
      : null,
    generatedClipCount,
  });
}
