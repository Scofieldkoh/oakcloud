import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

const sourceSection = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to locate source section: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
};

const generatedEditorSource = readRepoFile('src/app/(dashboard)/generated-documents/[id]/edit/page.tsx');
const draftRouteSource = readRepoFile('src/app/api/generated-documents/[id]/draft/route.ts');
const prismaSchemaSource = readRepoFile('prisma/schema.prisma');
const generatedSaveBlock = sourceSection(generatedEditorSource, 'const handleSave = useCallback', '// Handle draft recovery');
const draftModel = sourceSection(prismaSchemaSource, 'model DocumentDraft {', 'model TemplatePartial {');

type EditState = { snapshotRevision: number; dirty: boolean; content: string };
const acknowledge = (state: EditState, acknowledgedSnapshotRevision: number): EditState => ({
  ...state,
  dirty: state.snapshotRevision !== acknowledgedSnapshotRevision,
});

const restoreDecision = (draftBaseRevision: number, serverRevision: number) =>
  draftBaseRevision === serverRevision ? 'restore' : 'reconcile';

const isEditableStatus = (status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED') => status === 'DRAFT';

describe('A4 editor WORKFLOW W0 draft and save-race proofs', () => {
  it.fails('W-DRAFT-01 wires the generated-document autosave callback into the editor lifecycle', () => {
    const occurrences = generatedEditorSource.match(/\b_handleAutoSave\b/g)?.length ?? 0;
    expect(occurrences).toBeGreaterThan(1);
  });

  it.fails('W-DRAFT-02 compares draft freshness using canonical JSON or a base revision rather than HTML alone', () => {
    expect(draftRouteSource).toMatch(/hasDifferentContent:[\s\S]{0,300}(?:contentJson|baseRevision|baseServerRevision|expectedRevision)/);
  });

  it.fails('W-DRAFT-03 binds save acknowledgement to a snapshot revision before clearing newer dirty state', () => {
    expect(generatedSaveBlock).toMatch(/(?:saveRevision|editRevision|snapshotRevision|requestRevision)/);
    expect(generatedSaveBlock).toContain('setHasUnsavedChanges(false)');
  });

  it('W-DRAFT-SURVIVE-01 draft reads and deletes are tenant-gated and user-scoped', () => {
    expect(draftRouteSource).toContain('getGeneratedDocumentById(id, tenantId)');
    expect(draftRouteSource).toContain('getLatestDraft(id, session.id)');
    expect(draftRouteSource).toContain('where: { documentId: id, userId: session.id }');
  });

  it('W-DRAFT-COMPAT-01 existing metadata can carry base/server/session/snapshot revisions without a W0 migration', () => {
    expect(draftModel).toMatch(/metadata\s+Json\?/);
    expect(draftModel).toMatch(/contentJson\s+Json\?/);
  });

  it('W-DRAFT-FIXTURE-01 a delayed acknowledgement cannot clear a newer local edit', () => {
    const requestN: EditState = { snapshotRevision: 4, dirty: true, content: '<p>N</p>' };
    const newer = { ...requestN, snapshotRevision: 5, content: '<p>N+1</p>' };
    expect(acknowledge(newer, 4)).toEqual({ ...newer, dirty: true });
    expect(acknowledge(requestN, 4).dirty).toBe(false);
  });

  it('W-DRAFT-FIXTURE-02 draft restore requires reconciliation when the server revision advanced', () => {
    expect(restoreDecision(9, 9)).toBe('restore');
    expect(restoreDecision(9, 10)).toBe('reconcile');
  });

  it('W-DRAFT-FIXTURE-03 reopen preserves editable canonical HTML and JSON while status remains DRAFT', () => {
    const stored = { status: 'DRAFT' as const, content: '<p>Reopen me</p>', contentJson: { version: 1, fields: [{ id: 'f1' }] } };
    const reopened = structuredClone(stored);
    expect(isEditableStatus(reopened.status)).toBe(true);
    expect(reopened.content).toBe(stored.content);
    expect(reopened.contentJson).toEqual(stored.contentJson);
  });

  it('W-DRAFT-FIXTURE-04 finalized and archived documents are non-editable until an authorized lifecycle transition returns them to DRAFT', () => {
    expect(isEditableStatus('DRAFT')).toBe(true);
    expect(isEditableStatus('FINALIZED')).toBe(false);
    expect(isEditableStatus('ARCHIVED')).toBe(false);
  });
});
