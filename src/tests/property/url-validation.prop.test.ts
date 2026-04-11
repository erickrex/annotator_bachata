// Feature: clip-slicer-annotator, Property 1: YouTube URL Validation
// **Validates: Requirements 1.1, 1.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateUrl } from '../../services/url-validator.js';

const VIDEO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const validVideoId = fc
  .array(fc.constantFrom(...VIDEO_ID_CHARS.split('')), { minLength: 11, maxLength: 11 })
  .map((chars) => chars.join(''));

describe('Property 1: YouTube URL Validation', () => {
  it('standard YouTube URLs with valid video IDs return { valid: true, videoId: id }', () => {
    fc.assert(
      fc.property(validVideoId, (id) => {
        const url = `https://www.youtube.com/watch?v=${id}`;
        const result = validateUrl(url);
        expect(result).toEqual({ valid: true, videoId: id });
      }),
      { numRuns: 100 }
    );
  });

  it('short YouTube URLs with valid video IDs return { valid: true, videoId: id }', () => {
    fc.assert(
      fc.property(validVideoId, (id) => {
        const url = `https://youtu.be/${id}`;
        const result = validateUrl(url);
        expect(result).toEqual({ valid: true, videoId: id });
      }),
      { numRuns: 100 }
    );
  });

  it('non-YouTube strings return { valid: false, videoId: null }', () => {
    const nonYoutubeString = fc.string().filter((s) => {
      return !s.includes('youtube.com/watch?') && !s.includes('youtu.be/');
    });

    fc.assert(
      fc.property(nonYoutubeString, (s) => {
        const result = validateUrl(s);
        expect(result).toEqual({ valid: false, videoId: null });
      }),
      { numRuns: 100 }
    );
  });

  it('extracted video ID is always exactly 11 characters', () => {
    fc.assert(
      fc.property(validVideoId, (id) => {
        const standardResult = validateUrl(`https://www.youtube.com/watch?v=${id}`);
        const shortResult = validateUrl(`https://youtu.be/${id}`);

        expect(standardResult.valid).toBe(true);
        expect(standardResult.videoId).toHaveLength(11);

        expect(shortResult.valid).toBe(true);
        expect(shortResult.videoId).toHaveLength(11);
      }),
      { numRuns: 100 }
    );
  });
});
