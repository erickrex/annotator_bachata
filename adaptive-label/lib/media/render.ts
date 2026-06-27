import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createDerivedAsset,
  getClipById,
  getMediaAssetById,
  type DerivedAssetRow,
} from "@/lib/db";
import { exportsDir } from "@/lib/media/paths";

function beatMarkerFrames(metadata: Record<string, unknown>): number[] {
  const clip = metadata.clip;
  if (!clip || typeof clip !== "object") return [];
  const frames = (clip as { beatMarkerFrames?: unknown }).beatMarkerFrames;
  return Array.isArray(frames)
    ? frames.filter((frame): frame is number => typeof frame === "number")
    : [];
}

export async function renderClipToMp4(
  clipId: string,
): Promise<DerivedAssetRow> {
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    import("@remotion/bundler"),
    import("@remotion/renderer"),
  ]);
  const clip = await getClipById(clipId);
  if (!clip) throw new Error(`Clip not found: ${clipId}`);
  if (!clip.media_asset_id) {
    throw new Error("Clip is not tied to a runtime media asset.");
  }

  const media = await getMediaAssetById(clip.media_asset_id);
  if (!media) throw new Error(`Media asset not found: ${clip.media_asset_id}`);
  if (!media.local_video_path) {
    throw new Error("Media asset has no local source video path.");
  }
  if (clip.start_frame === null || clip.end_frame === null) {
    throw new Error("Clip has no frame range.");
  }

  const fps = Number(media.fps ?? 30);
  const durationInFrames = Math.max(1, clip.end_frame - clip.start_frame + 1);
  const outputDir = exportsDir(clip.project_id);
  await mkdir(outputDir, { recursive: true });
  const outputLocation = join(outputDir, `${clip.id}.mp4`);
  const entryPoint = join(process.cwd(), "remotion", "Root.tsx");
  const inputProps = {
    videoSrc: pathToFileURL(media.local_video_path).toString(),
    startFrame: clip.start_frame,
    beatMarkerFrames: beatMarkerFrames(clip.metadata_json),
  };

  const serveUrl = await bundle({
    entryPoint,
    ignoreRegisterRootWarning: false,
  });
  const composition = await selectComposition({
    serveUrl,
    id: "AdaptiveLabelClip",
    inputProps,
  });

  await renderMedia({
    composition: {
      ...composition,
      fps,
      durationInFrames,
      width: media.width ?? composition.width,
      height: media.height ?? composition.height,
    },
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    overwrite: true,
  });

  return createDerivedAsset({
    projectId: clip.project_id,
    mediaAssetId: media.id,
    clipId: clip.id,
    assetType: "rendered_clip_mp4",
    localPath: outputLocation,
    storageKey: `projects/${clip.project_id}/exports/${clip.id}.mp4`,
    metadata: {
      fps,
      durationInFrames,
      sourceVideoPath: media.local_video_path,
    },
  });
}
