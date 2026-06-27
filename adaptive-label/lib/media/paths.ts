import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

/** Absolute root where runtime media files are stored. */
export function mediaRoot(): string {
  const configured = process.env.ADAPTIVE_LABEL_MEDIA_DIR ?? ".media";
  return isAbsolute(configured)
    ? configured
    : join(/* turbopackIgnore: true */ process.cwd(), configured);
}

export async function ensureMediaDir(...segments: string[]): Promise<string> {
  const dir = join(mediaRoot(), ...segments);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function projectMediaDir(projectId: string): string {
  return join(mediaRoot(), "projects", projectId);
}

export function mediaAssetDir(projectId: string, mediaAssetId: string): string {
  return join(projectMediaDir(projectId), "sources", mediaAssetId);
}

export function exportsDir(projectId: string): string {
  return join(projectMediaDir(projectId), "exports");
}

/** Convert an absolute media path to a URL served by /api/runtime-media/[...path]. */
export function mediaUrlForLocalPath(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  const rel = relative(mediaRoot(), localPath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return `/api/runtime-media/${rel.split(sep).map(encodeURIComponent).join("/")}`;
}

/** Resolve a route path under the media root and prevent path traversal. */
export function resolveMediaRoutePath(parts: string[]): string | null {
  const decoded = parts.map((part) => decodeURIComponent(part));
  const full = join(mediaRoot(), ...decoded);
  const rel = relative(mediaRoot(), full);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}
