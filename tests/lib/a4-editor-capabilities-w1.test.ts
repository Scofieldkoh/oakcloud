import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_EDITOR_CAPABILITIES,
  SERVER_A4_EDITOR_CAPABILITIES,
  assertA4EditorWriterFormatLevel,
  constrainA4EditorCapabilities,
  getA4EditorCapabilities,
  parseA4EditorCapabilities,
} from '@/lib/document-editor/a4-editor-capabilities';
import { ApiError, ErrorCodes } from '@/lib/errors';

describe('A4 editor W1 capabilities', () => {
  it('keeps old/missing capability data at the conservative 1/1/optional fallback', () => {
    expect(parseA4EditorCapabilities(undefined)).toEqual(DEFAULT_A4_EDITOR_CAPABILITIES);
    expect(parseA4EditorCapabilities({ readerFormatLevel: 2 })).toEqual(
      DEFAULT_A4_EDITOR_CAPABILITIES,
    );
  });

  it('publishes level-2 reader support without enabling level-2 writes', () => {
    expect(getA4EditorCapabilities()).toEqual(SERVER_A4_EDITOR_CAPABILITIES);
    expect(SERVER_A4_EDITOR_CAPABILITIES).toEqual({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 1,
      revisionPrecondition: 'optional',
    });
  });

  it('parses a complete trusted bootstrap without inventing authority', () => {
    expect(parseA4EditorCapabilities({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 1,
      revisionPrecondition: 'optional',
    })).toEqual(SERVER_A4_EDITOR_CAPABILITIES);
  });

  it('never lets a client capability claim elevate server writer or revision authority', () => {
    expect(constrainA4EditorCapabilities({
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 2,
      revisionPrecondition: 'required',
    })).toEqual(SERVER_A4_EDITOR_CAPABILITIES);

    expect(constrainA4EditorCapabilities({
      readerFormatLevel: 1,
      allowedWriterFormatLevel: 1,
    })).toEqual({
      readerFormatLevel: 1,
      allowedWriterFormatLevel: 1,
      revisionPrecondition: 'optional',
    });
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
