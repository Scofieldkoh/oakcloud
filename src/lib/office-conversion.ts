import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

type OfficeDocumentType = 'pdf' | 'docx' | 'doc';

type ExecuteFile = (
  command: string,
  args: string[],
  options: {
    timeout: number;
    env: NodeJS.ProcessEnv;
    windowsHide: boolean;
  }
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile) as ExecuteFile;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46] as const;
const DOC_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0] as const;
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
] as const;

const WORD_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function startsWithSignature(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => buffer[index] === byte);
}

function hasDocxMarkers(buffer: Buffer): boolean {
  const content = buffer.toString('latin1');
  return content.includes('[Content_Types].xml') && content.includes('word/');
}

export function detectOfficeDocumentType(
  buffer: Buffer,
  fileName: string,
  clientMimeType?: string
): OfficeDocumentType | null {
  if (startsWithSignature(buffer, PDF_SIGNATURE)) {
    return 'pdf';
  }

  const lowerFileName = fileName.toLowerCase();
  const lowerMimeType = clientMimeType?.toLowerCase();

  if (ZIP_SIGNATURES.some((signature) => startsWithSignature(buffer, signature))) {
    if (
      hasDocxMarkers(buffer) ||
      lowerFileName.endsWith('.docx') ||
      lowerMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'docx';
    }
  }

  if (
    startsWithSignature(buffer, DOC_SIGNATURE) &&
    (lowerFileName.endsWith('.doc') || (lowerMimeType ? WORD_MIME_TYPES.has(lowerMimeType) : true))
  ) {
    return 'doc';
  }

  return null;
}

export function getPdfFileNameForUpload(fileName: string): string {
  const trimmedName = fileName.trim() || 'document';
  const extension = extname(trimmedName);
  const baseName = extension ? trimmedName.slice(0, -extension.length) : trimmedName;
  return `${baseName || 'document'}.pdf`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findLibreOfficeExecutable(): Promise<string> {
  const configuredPath = process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH;
  if (configuredPath) {
    return configuredPath;
  }

  const candidates = [
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return 'soffice';
}

function getInputExtension(fileName: string, buffer: Buffer, clientMimeType?: string): '.docx' | '.doc' {
  const detectedType = detectOfficeDocumentType(buffer, fileName, clientMimeType);
  if (detectedType === 'doc') {
    return '.doc';
  }
  return '.docx';
}

function sanitizeInputBaseName(fileName: string): string {
  const rawBaseName = basename(fileName, extname(fileName)) || 'document';
  const sanitized = rawBaseName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || `document-${randomUUID()}`;
}

export async function convertOfficeDocumentToPdf(input: {
  buffer: Buffer;
  fileName: string;
  clientMimeType?: string;
  executablePath?: string;
  executeFile?: ExecuteFile;
}): Promise<Buffer> {
  const executablePath = input.executablePath ?? await findLibreOfficeExecutable();
  const executeFile = input.executeFile ?? execFileAsync;
  const tempRoot = await mkdtemp(join(tmpdir(), 'oakcloud-office-'));
  const inputDir = join(tempRoot, 'input');
  const outputDir = join(tempRoot, 'output');
  const libreOfficeProfileDir = join(tempRoot, 'profile');

  try {
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await mkdir(libreOfficeProfileDir, { recursive: true });

    const inputExtension = getInputExtension(input.fileName, input.buffer, input.clientMimeType);
    const inputBaseName = sanitizeInputBaseName(input.fileName);
    const inputPath = join(inputDir, `${inputBaseName}${inputExtension}`);
    const outputPath = join(outputDir, `${inputBaseName}.pdf`);

    await writeFile(inputPath, input.buffer);

    await executeFile(
      executablePath,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        `-env:UserInstallation=${pathToFileURL(libreOfficeProfileDir).toString()}`,
        '--convert-to',
        'pdf',
        '--outdir',
        outputDir,
        inputPath,
      ],
      {
        timeout: 60_000,
        env: {
          ...process.env,
          HOME: tempRoot,
          TMPDIR: tempRoot,
        },
        windowsHide: true,
      }
    );

    try {
      return await readFile(outputPath);
    } catch {
      throw new Error('LibreOffice did not produce a PDF for the uploaded Word document');
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
