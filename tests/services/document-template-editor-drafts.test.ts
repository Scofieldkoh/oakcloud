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

const generatedEditorSource = readRepoFile(
  'src/app/(dashboard)/generated-documents/[id]/edit/page.tsx',
);
const draftRouteSource = readRepoFile(
  'src/app/api/generated-documents/[id]/draft/route.ts',
);
const prismaSchemaSource = readRepoFile('prisma/schema.prisma');

const generatedSaveBlock = sourceSection(
  generatedEditorSource,
  'const handleSave = useCallback',
  '// Handle draft recovery',
);
const draftModel = sourceSection(
  prismaSchemaSource,
  'model DocumentDraft {',
  'model TemplatePartial {',
);

describe('A4 editor WORKFLOW W0 draft and save-race proofs', () => {
  it.fails(
    'W-DRAFT-01 wires the generated-document autosave callback into the editor lifecycle',
    () => {
      const occurrences =
        generatedEditorSource.match(/\b_handleAutoSave\b/g)?.length ?? 0;
      expect(occurrences).toBeGreaterThan(1);
    },
  );

  it.fails(
    'W-DRAFT-02 compares draft freshness using canonical JSON or a base revision rather than HTML alone',
    () => {
      expect(draftRouteSource).toMatch(
        /hasDifferentContent:[\s\S]{0,300}(?:contentJson|baseRevision|baseUpdatedAt|expectedRevision)/,
      );
    },
  );

  it.fails(
    'W-DRAFT-03 binds save acknowledgement to an edit/save revision before clearing newer dirty state',
    () => {
      expect(generatedSaveBlock).toMatch(
        /(?:saveRevision|editRevision|snapshotRevision|requestRevision)/,
      );
      expect(generatedSaveBlock).toContain('setHasUnsavedChanges(false)');
    },
  );

  it(
    'W-DRAFT-SURVIVE-01 draft reads and deletes are both tenant-gated and user-scoped',
    () => {
      expect(draftRouteSource).toContain(
        'getGeneratedDocumentById(id, tenantId)',
      );
      expect(draftRouteSource).toContain('getLatestDraft(id, session.id)');
      expect(draftRouteSource).toContain(
        'where: { documentId: id, userId: session.id }',
      );
    },
  );

  it(
    'W-DRAFT-COMPAT-01 existing metadata can carry a base revision before any typed draft-schema migration is considered',
    () => {
      expect(draftModel).toMatch(/metadata\s+Json\?/);
      expect(draftModel).toMatch(/contentJson\s+Json\?/);
    },
  );
});
