import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

const sourceSection = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate source section: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
};

const templateEditorSource = readRepoFile(
  'src/app/(dashboard)/template-partials/editor/page.tsx',
);
const templateServiceSource = readRepoFile(
  'src/services/document-template.service.ts',
);
const templateValidationSource = readRepoFile(
  'src/lib/validations/document-template.ts',
);
const prismaSchemaSource = readRepoFile('prisma/schema.prisma');

const templateSaveBlock = sourceSection(
  templateEditorSource,
  'const handleSave = useCallback',
  '// Handle keyboard shortcuts',
);

describe('A4 editor WORKFLOW W0 template persistence proofs', () => {
  it.fails(
    'W-SAVE-01 takes the canonical editor snapshot at submit time instead of delayed parent form content',
    () => {
      expect(templateSaveBlock).not.toContain('content: formData.content');
      expect(templateSaveBlock).not.toContain(
        'mergeA4DocumentLayout(existingTemplate?.contentJson, formData.layout)',
      );
    },
  );

  it.fails(
    'W-SAVE-02 rejects stale template writers with an explicit expected version precondition',
    () => {
      expect(templateValidationSource).toContain('expectedVersion');
      expect(templateServiceSource).toMatch(
        /documentTemplate\.(?:update|updateMany)\(\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*data\.id,[\s\S]*?version:\s*data\.expectedVersion/,
      );
    },
  );

  it(
    'W-SAVE-COMPAT-01 already has a monotonic template version that later CAS can reuse without changing old contentJson',
    () => {
      const templateModel = sourceSection(
        prismaSchemaSource,
        'model DocumentTemplate {',
        'model GeneratedDocument {',
      );

      expect(templateModel).toMatch(/version\s+Int\s+@default\(1\)/);
      expect(templateServiceSource).toContain('version: { increment: 1 }');
      expect(templateValidationSource).toContain(
        'contentJson: contentJsonSchema.optional().nullable()',
      );
    },
  );
});
