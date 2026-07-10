import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentGenerationWizard,
  type DocumentContact,
} from '@/components/documents/document-generation-wizard';
import type { DocumentTemplate } from '@/components/documents/template-selector';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: React.forwardRef(function MockA4PageEditor(
    props: { value?: string; onChange?: (value: string) => void },
    _ref
  ) {
    return (
      <textarea
        aria-label="Document content"
        value={props.value || ''}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    );
  }),
}));

const template: DocumentTemplate = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Resolution',
  description: 'Board resolution',
  category: 'RESOLUTION',
  content: '<p>{{custom.resolutionNumber}}</p>',
  placeholders: [
    {
      key: 'custom.resolutionNumber',
      label: 'Resolution Number',
      category: 'custom',
      type: 'text',
      required: true,
    },
  ],
  isActive: true,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const contacts: DocumentContact[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Jane Tan',
    email: 'jane@example.com',
  },
];

describe('DocumentGenerationWizard', () => {
  it('lets staff select contacts and blocks preview when required custom fields are empty', () => {
    const onGenerate = vi.fn();

    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[]}
        contacts={contacts}
        onGenerate={onGenerate}
      />
    );

    const clickNext = () => fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getAllByText('Resolution')[1]);
    clickNext();
    clickNext();

    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Jane Tan'));
    clickNext();

    clickNext();

    expect(screen.getByText('Resolution Number is required')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
