import { describe, it, expect } from 'vitest';
import { slugify, buildFolderName } from '@/lib/utils/slug-utils';

describe('slugify', () => {
  it('converts to lowercase and replaces spaces with underscores', () => {
    expect(slugify('Bachata Tutorial Beginners')).toBe('bachata_tutorial_beginners');
  });

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(slugify('Hello, World! (2024)')).toBe('hello_world_2024');
  });

  it('collapses consecutive underscores', () => {
    expect(slugify('foo---bar___baz')).toBe('foo_bar_baz');
  });

  it('removes leading and trailing underscores', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for all-special-chars input', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toBe('a'.repeat(60));
  });

  it('removes trailing underscore introduced by truncation', () => {
    // 59 a's followed by a space then more text → slug becomes 59 a's + _ then truncated
    const input = 'a'.repeat(59) + ' hello';
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('_')).toBe(false);
  });

  it('handles unicode characters', () => {
    expect(slugify('café résumé')).toBe('caf_r_sum');
  });

  it('preserves digits', () => {
    expect(slugify('track 01 remix 2024')).toBe('track_01_remix_2024');
  });
});

describe('buildFolderName', () => {
  it('formats as YYYY-MM-DD_slug', () => {
    expect(buildFolderName('2026-05-02T14:30:00Z', 'Bachata Tutorial', 'yt_abc123'))
      .toBe('2026-05-02_bachata_tutorial');
  });

  it('uses sourceId when title is empty', () => {
    expect(buildFolderName('2026-05-02T14:30:00Z', '', 'yt_abc123'))
      .toBe('2026-05-02_yt_abc123');
  });

  it('uses sourceId when title is falsy (whitespace only)', () => {
    // Whitespace-only title slugifies to empty, so fallback to sourceId
    expect(buildFolderName('2026-05-02T14:30:00Z', '   ', 'yt_abc123'))
      .toBe('2026-05-02_yt_abc123');
  });

  it('extracts date from full ISO 8601 string', () => {
    expect(buildFolderName('2024-12-31T23:59:59.999Z', 'test', 'src1'))
      .toBe('2024-12-31_test');
  });
});
