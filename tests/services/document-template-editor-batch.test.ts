import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  extractA4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';

const readRepoFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

const batchReviewSource = readRepoFile(
  'src/components/documents/generation-batch/batch-review-workspace.tsx',
);
const batchWorkspaceSource = readRepoFile(
  'src/components/documents/generation-batch/document-generation-batch-workspace.tsx',
);
const batchHookSource = readRepoFile(
  'src/components/documents/generation-batch/use-document-generation-batch.ts',
);

describe('A4 editor WORKFLOW W0 batch persistence proofs', () => {
  it.fails(
    'W-BATCH-01 preserves existing contentJson when a body-only edit is sent through batch review',
    () => {
      expect(batchReviewSource).not.toContain(
        'onEditContent(activeItem.key, html, null)',
      );
    },
  );

  it.fails(
    'W-BATCH-02 merges a layout edit into existing item metadata instead of replacing sibling contentJson',
    () => {
      expect(batchReviewSource).toMatch(
        /onLayoutChange=\{\(nextLayout\)[\s\S]{0,500}activeItem\.editedContentJson/,
      );
      expect(batchReviewSource).not.toContain(
        '{ version: 1, layout: nextLayout }',
      );
    },
  );

  it.fails(
    'W-BATCH-03 derives the active editor layout from item-edited contentJson before falling back to template metadata',
    () => {
      expect(batchWorkspaceSource).toMatch(
        /const activeLayout =[\s\S]{0,500}activeItem[\s\S]{0,300}editedContentJson/,
      );
    },
  );

  it(
    'W-BATCH-SURVIVE-01 the batch persistence hook already carries expectedRevision and editedContentJson when local state preserves them',
    () => {
      expect(batchHookSource).toContain(
        'editedContentJson: item.editedContentJson',
      );
      expect(batchHookSource).toContain(
        'expectedRevision: state.batch.revision ?? 0',
      );
    },
  );

  it(
    'W-BATCH-COMPAT-01 older templates without versioned contentJson still resolve to the default A4 layout',
    () => {
      expect(extractA4DocumentLayout(null)).toEqual(DEFAULT_A4_DOCUMENT_LAYOUT);
      expect(extractA4DocumentLayout({ legacy: true })).toEqual(
        DEFAULT_A4_DOCUMENT_LAYOUT,
      );
    },
  );
});
