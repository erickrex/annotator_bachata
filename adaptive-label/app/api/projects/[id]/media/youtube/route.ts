import { mkdir } from "node:fs/promises";

import { createMediaAsset, getProjectById } from "@/lib/db";
import { mediaAssetDir } from "@/lib/media/paths";
import { createProcessingJob, startMediaProcessing } from "@/lib/media/process";
import { validateUrl } from "@/lib/utils/url-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return Response.json(
      { error: `Project ${projectId} not found.` },
      { status: 404 },
    );
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const parsed = validateUrl(url);
  if (!parsed.valid) {
    return Response.json(
      { error: "A valid YouTube watch or youtu.be URL is required." },
      { status: 400 },
    );
  }

  const media = await createMediaAsset({
    projectId,
    filename: `${parsed.videoId}.mp4`,
    storageKey: `youtube/${parsed.videoId}`,
    status: "importing",
    sourceType: "youtube",
    originalUrl: url,
    metadata: { youtubeVideoId: parsed.videoId },
  });
  await mkdir(mediaAssetDir(projectId, media.id), { recursive: true });

  const job = await createProcessingJob(media);
  startMediaProcessing({ mediaAssetId: media.id, jobId: job.id });

  return Response.json({ mediaAsset: media, job }, { status: 202 });
}
