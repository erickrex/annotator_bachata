import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

import { resolveMediaRoutePath } from "@/lib/media/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".wav": "audio/wav",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const localPath = resolveMediaRoutePath(path);
  if (!localPath) return Response.json({ error: "Invalid media path." }, { status: 400 });

  try {
    const info = await stat(localPath);
    if (!info.isFile()) {
      return Response.json({ error: "Media path is not a file." }, { status: 404 });
    }
    const type = CONTENT_TYPES[extname(localPath).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${info.size}` },
        });
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : info.size - 1;
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end >= info.size ||
        start > end
      ) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${info.size}` },
        });
      }

      const stream = createReadStream(localPath, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "accept-ranges": "bytes",
          "content-type": type,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${info.size}`,
        },
      });
    }

    const stream = createReadStream(localPath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "accept-ranges": "bytes",
        "content-type": type,
        "content-length": String(info.size),
      },
    });
  } catch {
    return Response.json({ error: "Media file not found." }, { status: 404 });
  }
}
