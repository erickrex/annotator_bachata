import { getLatestDerivedAssetForClip } from "@/lib/db";
import { mediaUrlForLocalPath } from "@/lib/media/paths";
import { renderClipToMp4 } from "@/lib/media/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const derivedAsset = await renderClipToMp4(id);
    return Response.json({
      derivedAsset,
      url: mediaUrlForLocalPath(derivedAsset.local_path),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const derivedAsset = await getLatestDerivedAssetForClip(id, "rendered_clip_mp4");
  return Response.json({
    derivedAsset,
    url: mediaUrlForLocalPath(derivedAsset?.local_path),
  });
}
