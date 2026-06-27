/**
 * YouTube URL validator.
 * Supports standard URLs (youtube.com/watch?v=...) and short URLs (youtu.be/...).
 * Video IDs are 11 characters: alphanumeric, hyphens, and underscores.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const STANDARD_URL_PATTERN =
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:&[^#]*)?(?:#.*)?$/;

const SHORT_URL_PATTERN =
  /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:\?[^#]*)?(?:#.*)?$/;

export function validateUrl(url: string): { valid: boolean; videoId: string | null } {
  if (!url || typeof url !== 'string') {
    return { valid: false, videoId: null };
  }

  let match = url.match(STANDARD_URL_PATTERN);
  if (match) {
    const videoId = match[1];
    if (VIDEO_ID_PATTERN.test(videoId)) {
      return { valid: true, videoId };
    }
  }

  match = url.match(SHORT_URL_PATTERN);
  if (match) {
    const videoId = match[1];
    if (VIDEO_ID_PATTERN.test(videoId)) {
      return { valid: true, videoId };
    }
  }

  return { valid: false, videoId: null };
}
