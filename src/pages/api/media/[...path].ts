import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { errorResponse, getAppState } from '../../../services/app-state.js';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

function isAllowedMediaPath(relativePath: string): boolean {
  return (
    relativePath === 'sources' ||
    relativePath.startsWith('sources/') ||
    relativePath === 'exports' ||
    relativePath.startsWith('exports/')
  );
}

function makeContentType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export const GET: APIRoute = async ({ params, request }) => {
  const rawPath = params.path;
  if (!rawPath) {
    return errorResponse('Missing media path');
  }

  const relativePath = decodeURIComponent(rawPath).replace(/^\/+/, '');
  if (!isAllowedMediaPath(relativePath)) {
    return errorResponse('Invalid media path', 403);
  }

  const projectDir = getAppState().projectDir;
  const projectRoot = resolve(projectDir);
  const absolutePath = resolve(projectDir, relativePath);

  if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${sep}`)) {
    return errorResponse('Invalid media path', 403);
  }

  let fileStats;
  try {
    fileStats = await stat(absolutePath);
  } catch {
    return errorResponse('Media file not found', 404);
  }

  if (!fileStats.isFile()) {
    return errorResponse('Media file not found', 404);
  }

  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Content-Type': makeContentType(absolutePath),
  };

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    const stream = createReadStream(absolutePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        ...commonHeaders,
        'Content-Length': String(fileStats.size),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${fileStats.size}`,
      },
    });
  }

  let start = match[1] === '' ? 0 : Number.parseInt(match[1], 10);
  let end = match[2] === '' ? fileStats.size - 1 : Number.parseInt(match[2], 10);

  if (match[1] === '' && match[2] !== '') {
    const suffixLength = Number.parseInt(match[2], 10);
    start = Math.max(fileStats.size - suffixLength, 0);
    end = fileStats.size - 1;
  }

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    start > end ||
    start >= fileStats.size
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${fileStats.size}`,
      },
    });
  }

  end = Math.min(end, fileStats.size - 1);

  const stream = createReadStream(absolutePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
    },
  });
};
