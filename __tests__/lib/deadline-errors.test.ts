import { describe, expect, it } from 'vitest';
import { DeadlineApiError, ErrorCodes } from '@/lib/errors';

describe('deadline API errors', () => {
  it('preserves a deadline code and explicit conflict/validation status', () => {
    const conflict = new DeadlineApiError(ErrorCodes.VERSION_CONFLICT, 'Draft changed', 409);
    const invalid = new DeadlineApiError(ErrorCodes.MISSING_RULE_INPUT, 'Input missing', 422);

    expect(conflict).toMatchObject({ code: 'VERSION_CONFLICT', statusCode: 409 });
    expect(invalid).toMatchObject({ code: 'MISSING_RULE_INPUT', statusCode: 422 });
  });

  it('rejects statuses outside the conflict and validation contract', () => {
    expect(() => new DeadlineApiError(
      ErrorCodes.VERSION_CONFLICT,
      'invalid status',
      400 as 409,
    )).toThrow('Deadline errors must use HTTP 409 or 422');
  });
});
