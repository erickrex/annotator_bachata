import { describe, it, expect } from 'vitest';
import { validateUrl } from './url-validator.js';

describe('validateUrl', () => {
  describe('standard YouTube URLs', () => {
    it('accepts https://www.youtube.com/watch?v=VIDEO_ID', () => {
      const result = validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts http://www.youtube.com/watch?v=VIDEO_ID', () => {
      const result = validateUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts https://youtube.com/watch?v=VIDEO_ID (no www)', () => {
      const result = validateUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts URLs with additional query parameters', () => {
      const result = validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts URLs with v= not as first param', () => {
      const result = validateUrl('https://www.youtube.com/watch?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&v=dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts video IDs with hyphens and underscores', () => {
      const result = validateUrl('https://www.youtube.com/watch?v=abc-_12DEfg');
      expect(result).toEqual({ valid: true, videoId: 'abc-_12DEfg' });
    });
  });

  describe('short YouTube URLs', () => {
    it('accepts https://youtu.be/VIDEO_ID', () => {
      const result = validateUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts http://youtu.be/VIDEO_ID', () => {
      const result = validateUrl('http://youtu.be/dQw4w9WgXcQ');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });

    it('accepts short URLs with query parameters', () => {
      const result = validateUrl('https://youtu.be/dQw4w9WgXcQ?t=30');
      expect(result).toEqual({ valid: true, videoId: 'dQw4w9WgXcQ' });
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(validateUrl('')).toEqual({ valid: false, videoId: null });
    });

    it('rejects non-URL strings', () => {
      expect(validateUrl('not a url')).toEqual({ valid: false, videoId: null });
    });

    it('rejects other website URLs', () => {
      expect(validateUrl('https://www.google.com')).toEqual({ valid: false, videoId: null });
    });

    it('rejects YouTube URLs without video ID', () => {
      expect(validateUrl('https://www.youtube.com/watch')).toEqual({ valid: false, videoId: null });
    });

    it('rejects YouTube URLs with short video ID', () => {
      expect(validateUrl('https://www.youtube.com/watch?v=abc')).toEqual({ valid: false, videoId: null });
    });

    it('rejects YouTube URLs with long video ID', () => {
      expect(validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQx')).toEqual({ valid: false, videoId: null });
    });

    it('rejects youtu.be without video ID', () => {
      expect(validateUrl('https://youtu.be/')).toEqual({ valid: false, videoId: null });
    });

    it('rejects YouTube channel URLs', () => {
      expect(validateUrl('https://www.youtube.com/@channel')).toEqual({ valid: false, videoId: null });
    });

    it('rejects YouTube playlist URLs without v param', () => {
      expect(validateUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toEqual({ valid: false, videoId: null });
    });
  });
});
