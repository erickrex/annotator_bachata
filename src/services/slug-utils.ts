/**
 * Slug utilities for generating filesystem-safe folder names
 * from video titles and download dates.
 */

/**
 * Convert a string into a URL/filesystem-safe slug.
 *
 * Algorithm:
 * 1. Convert to lowercase
 * 2. Replace any character that is not [a-z0-9] with _
 * 3. Collapse consecutive underscores into a single underscore
 * 4. Remove leading and trailing underscores
 * 5. Truncate to 60 characters
 * 6. Remove any trailing underscore introduced by truncation
 */
export function slugify(title: string): string {
  let slug = title.toLowerCase();
  slug = slug.replace(/[^a-z0-9]/g, '_');
  slug = slug.replace(/_+/g, '_');
  slug = slug.replace(/^_+|_+$/g, '');
  slug = slug.slice(0, 60);
  slug = slug.replace(/_+$/, '');
  return slug;
}

/**
 * Build a folder name from a download timestamp, video title, and source ID.
 *
 * Format: YYYY-MM-DD_slugified_title
 * Falls back to sourceId as the slug portion if title is empty/falsy.
 */
export function buildFolderName(downloadedAt: string, title: string, sourceId: string): string {
  const date = downloadedAt.slice(0, 10);
  const slug = title ? slugify(title) || sourceId : sourceId;
  return `${date}_${slug}`;
}
