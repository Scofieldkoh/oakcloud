import { describe, expect, it } from 'vitest';
import { clampLimit, createErrorResponse, parseIntegerParam, parseNumericParam } from '@/lib/api-helpers';
import { NotFoundError, ValidationError } from '@/lib/errors';

describe('api-helpers', () => {
  describe('parseNumericParam', () => {
    it('returns the default for non-finite values', () => {
      expect(parseNumericParam('Infinity', 7)).toBe(7);
      expect(parseNumericParam('-Infinity', 7)).toBe(7);
      expect(parseNumericParam('NaN', 7)).toBe(7);
    });

    it('treats blank input as missing', () => {
      expect(parseNumericParam('   ', 5)).toBe(5);
      expect(parseNumericParam(null, 5)).toBe(5);
    });
  });

  describe('parseIntegerParam', () => {
    it('floors decimal input so pagination stays integral', () => {
      expect(parseIntegerParam('3.9')).toBe(3);
      expect(parseIntegerParam('-1.2')).toBe(-2);
    });

    it('falls back for invalid or non-finite values', () => {
      expect(parseIntegerParam('Infinity', 4)).toBe(4);
      expect(parseIntegerParam('nope', 4)).toBe(4);
    });
  });

  describe('clampLimit', () => {
    it('normalizes finite values into the configured bounds', () => {
      expect(clampLimit(250, { default: 20, max: 200 })).toBe(200);
      expect(clampLimit(0, { default: 20, min: 1, max: 200 })).toBe(1);
      expect(clampLimit(12.8, { default: 20, max: 200 })).toBe(12);
    });
  });

  describe('createErrorResponse', () => {
    it('preserves typed not-found errors with the stable route payload shape', async () => {
      const response = createErrorResponse(new NotFoundError('Document not found'));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Document not found' });
    });

    it('preserves typed validation errors with a 400 status', async () => {
      const response = createErrorResponse(new ValidationError('Shareholder is already active'));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Shareholder is already active' });
    });
  });
});
