import {
  createMediaJob,
  getMediaAssetById,
  updateMediaAsset,
  updateMediaJob,
} from "@/lib/db";
import {
  DEFAULT_BEAT_COUNTS,
  regenerateClipsForMedia,
} from "@/lib/media/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseBeatCounts(input: unknown): Array<8 | 16 | 32> | null {
  if (input === undefined) return DEFAULT_BEAT_COUNTS;
  if (!Array.isArray(input)) return null;
  const values = input.map(Number);
  if (values.length === 0) return null;
  if (!values.every((value) => value === 8 || value === 16 || value === 32)) {
    return null;
  }
  return Array.from(new Set(values)) as Array<8 | 16 | 32>;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await context.params;
  const media = await getMediaAssetById(mediaAssetId);
  if (!media) {
    return Response.json(
      { error: `Media asset ${mediaAssetId} not found.` },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const beatCounts = parseBeatCounts((body as { beatCounts?: unknown }).beatCounts);
  if (!beatCounts) {
    return Response.json(
      { error: "beatCounts must be an array containing only 8, 16, and/or 32." },
      { status: 400 },
    );
  }

  const job = await createMediaJob({
    projectId: media.project_id,
    mediaAssetId,
    type: "generate_clips",
    status: "running",
    progress: 0,
  });

  try {
    await updateMediaAsset(mediaAssetId, {
      status: "generating_clips",
      errorMessage: null,
    });
    const clips = await regenerateClipsForMedia(mediaAssetId, beatCounts);
    await updateMediaAsset(mediaAssetId, { status: "ready" });
    await updateMediaJob(job.id, {
      status: "succeeded",
      progress: 100,
      completedAt: new Date(),
    });
    return Response.json({ jobId: job.id, generatedClipCount: clips.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateMediaAsset(mediaAssetId, {
      status: "failed",
      errorMessage: message,
    });
    await updateMediaJob(job.id, {
      status: "failed",
      progress: 100,
      errorMessage: message,
      completedAt: new Date(),
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
