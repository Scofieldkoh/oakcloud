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
const partialServiceSource = readRepoFile(
  'src/services/template-partial.service.ts',
);
const prismaSchemaSource = readRepoFile('prisma/schema.prisma');

const templateSaveBlock = sourceSection(
  templateEditorSource,
  'const handleSave = useCallback',
  '// Handle keyboard shortcuts',
);
const generatedDocumentModel = sourceSection(
  prismaSchemaSource,
  'model GeneratedDocument {',
  'model DocumentDraft {',
);

describe('A4 editor WORKFLOW W0 persistence and revision proofs', () => {
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
    'W-SAVE-02 exposes expectedRevision and atomically maps it to DocumentTemplate.version',
    () => {
      expect(templateValidationSource).toContain('expectedRevision');
      expect(templateServiceSource).toMatch(
        /documentTemplate\.(?:update|updateMany)\(\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*data\.id,[\s\S]*?version:\s*data\.expectedRevision/,
      );
    },
  );

  it.fails(
    'W-SAVE-03 gives TemplatePartial the same expectedRevision compare-and-swap contract over its existing version',
    () => {
      expect(partialServiceSource).toContain('expectedRevision');
      expect(partialServiceSource).toMatch(
        /templatePartial\.(?:update|updateMany)\(\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*data\.id,[\s\S]*?version:\s*data\.expectedRevision/,
      );
    },
  );

  it.fails(
    'W-SAVE-04 reserves a dedicated GeneratedDocument revision instead of reusing templateVersion provenance',
    () => {
      expect(generatedDocumentModel).toMatch(/\brevision\s+Int\s+@default\(0\)/);
      expect(generatedDocumentModel).toMatch(/\btemplateVersion\s+Int\?/);
    },
  );

  it(
    'W-SAVE-COMPAT-01 existing template and partial versions can back expectedRevision without rewriting old contentJson',
    () => {
      const templateModel = sourceSection(
        prismaSchemaSource,
        'model DocumentTemplate {',
        'model GeneratedDocument {',
      );

      expect(templateModel).toMatch(/version\s+Int\s+@default\(1\)/);
      expect(prismaSchemaSource).toMatch(
        /model TemplatePartial \{[\s\S]*?version\s+Int\s+@default\(1\)/,
      );
      expect(templateServiceSource).toContain('version: { increment: 1 }');
      expect(partialServiceSource).toContain(
        'if (materialChanged) updateData.version = { increment: 1 };',
      );
      expect(templateValidationSource).toContain(
        'contentJson: contentJsonSchema.optional().nullable()',
      );
    },
  );

  it(
    'W-SAVE-COMPAT-02 keeps GeneratedDocument.templateVersion as generation provenance while an edit revision is added separately',
    () => {
      expect(generatedDocumentModel).toMatch(/\btemplateVersion\s+Int\?/);
    },
  );
});
