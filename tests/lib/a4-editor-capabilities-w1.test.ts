import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_EDITOR_CAPABILITIES,
  assertA4EditorWriterFormatLevel,
  constrainA4EditorCapabilities,
  parseA4EditorCapabilities,
} from '@/lib/document-editor/a4-editor-capabilities';
import { ApiError, ErrorCodes } from '@/lib/errors';

describe('A4 editor W1 capabilities', () => {
  it('falls back conservatively when capability data is absent or malformed', () => {
    expect(parseA4EditorCapabilities(undefined)).toEqual(DEFAULT_A4_EDITOR_CAPABILITIES);
    expect(parseA4EditorCapabilities({ readerFormatLevel: 2 })).toEqual(
      DEFAULT_A4_EDITOR_CAPABILITIES,
    );
    expect(parseA4EditorCapabilities({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 1,
      revisionPrecondition: 'optional',
    })).toEqual({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 1,
      revisionPrecondition: 'optional',
    });
  });

  it('never lets a client capability claim elevate server authority', () => {
    expect(constrainA4EditorCapabilities({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 2,
      revisionPrecondition: 'required',
    })).toEqual(DEFAULT_A4_EDITOR_CAPABILITIES);
  });

  it('rejects level-2 writer use while W1 keeps writer level 1', () => {
    expect(() => assertA4EditorWriterFormatLevel(2)).toThrowError(ApiError);
    try {
      assertA4EditorWriterFormatLevel(2);
      throw new Error('expected writer guard to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: ErrorCodes.UNSUPPORTED_EDITOR_FORMAT,
        statusCode: 409,
      });
    }
  });
});
