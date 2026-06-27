import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  convertOfficeDocumentToPdf,
  detectOfficeDocumentType,
  getPdfFileNameForUpload,
} from '@/lib/office-conversion';

function makeDocxBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('fake zip content [Content_Types].xml word/document.xml'),
  ]);
}

function makeDocBuffer(): Buffer {
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
}

describe('office-conversion', () => {
  it('detects OOXML Word documents by content', () => {
    expect(
      detectOfficeDocumentType(
        makeDocxBuffer(),
        'spoofed.pdf',
        'application/pdf'
      )
    ).toBe('docx');
  });

  it('detects legacy Word documents by content', () => {
    expect(
      detectOfficeDocumentType(
        makeDocBuffer(),
        'document.doc',
        'application/msword'
      )
    ).toBe('doc');
  });

  it('returns pdf for real PDF content', () => {
    expect(
      detectOfficeDocumentType(
        Buffer.from('%PDF-1.7\n'),
        'document.pdf',
        'application/pdf'
      )
    ).toBe('pdf');
  });

  it('normalizes converted Word upload names to PDF filenames', () => {
    expect(getPdfFileNameForUpload('Engagement Letter.docx')).toBe('Engagement Letter.pdf');
    expect(getPdfFileNameForUpload('resolution')).toBe('resolution.pdf');
  });

  it('converts Word buffers by invoking LibreOffice and reading the generated PDF', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.7\nconverted');
    const executeFile = vi.fn(async (_command: string, args: string[]) => {
      const outDir = args[args.indexOf('--outdir') + 1];
      const inputPath = args[args.length - 1];
      const expectedOutput = join(outDir, `${inputPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')}.pdf`);
      await writeFile(expectedOutput, pdfBuffer);
      return { stdout: '', stderr: '' };
    });

    const result = await convertOfficeDocumentToPdf({
      buffer: makeDocxBuffer(),
      fileName: 'letter.docx',
      executablePath: 'soffice',
      executeFile,
    });

    expect(result).toEqual(pdfBuffer);
    expect(executeFile).toHaveBeenCalledWith(
      'soffice',
      expect.arrayContaining(['--headless', '--convert-to', 'pdf']),
      expect.objectContaining({
        timeout: expect.any(Number),
      })
    );
  });

  it('throws a clear error when LibreOffice does not produce a PDF', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'office-conversion-test-'));
    await writeFile(join(tempDir, 'placeholder.txt'), 'no pdf here');

    await expect(
      convertOfficeDocumentToPdf({
        buffer: makeDocxBuffer(),
        fileName: 'letter.docx',
        executablePath: 'soffice',
        executeFile: vi.fn(async () => {
          await readFile(join(tempDir, 'placeholder.txt'));
          return { stdout: '', stderr: '' };
        }),
      })
    ).rejects.toThrow('LibreOffice did not produce a PDF');
  });
});
