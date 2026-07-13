import { describe, expect, it, vi } from 'vitest';
import { buildEachBlock } from '@/components/documents/template-editor/template-builders';
import { insertTemplateSnippet } from '@/components/documents/template-editor/template-insertion';

describe('template snippet insertion', () => {
  it('inserts a generated loop as HTML instead of literal editor text', () => {
    const insertHtmlAtCursor = vi.fn();
    const loop = buildEachBlock({
      collection: 'directors',
      fields: ['name'],
      layout: 'paragraphs',
    });

    insertTemplateSnippet({ insertHtmlAtCursor }, loop);

    expect(insertHtmlAtCursor).toHaveBeenCalledWith(loop);
  });
});
