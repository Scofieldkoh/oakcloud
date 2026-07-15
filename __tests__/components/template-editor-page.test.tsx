import { describe, expect, it } from 'vitest';

import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import { commitTemplateFormChange } from '@/components/documents/template-editor/template-editor-state';

describe('template editor page panel integration', () => {
  it('applies a panel layout change to production form state and marks it dirty', () => {
    type Form = {
      name: string;
      layout: A4DocumentLayout;
    };
    let formData: Form = {
      name: 'Board resolution',
      layout: DEFAULT_A4_DOCUMENT_LAYOUT,
    };
    let isDirty = false;

    commitTemplateFormChange<Form>(
      (update) => { formData = update(formData); },
      (nextIsDirty) => { isDirty = nextIsDirty; },
      {
        layout: {
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          fontFamily: 'Georgia, serif',
        },
      },
    );

    expect(formData.layout.fontFamily).toBe('Georgia, serif');
    expect(isDirty).toBe(true);
  });
});
