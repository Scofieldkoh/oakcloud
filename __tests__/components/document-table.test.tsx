import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    data: {
      'generated-documents:list:columns:v1': {
        key: 'generated-documents:list:columns:v1',
        value: {},
        updatedAt: null,
      },
    },
  }),
  useUpsertUserPreference: () => ({ mutate: vi.fn() }),
}));

import { DocumentTable, type GeneratedDocument } from '@/components/documents/document-table';

function documentFixture(overrides: Partial<GeneratedDocument> = {}): GeneratedDocument {
  return {
    id: 'doc-1',
    title: 'Annual minutes',
    status: 'DRAFT',
    content: '<p>Draft</p>',
    useLetterhead: true,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-02T08:00:00.000Z',
    company: { id: 'company-1', name: 'Acme Pte Ltd', uen: '202600001A' },
    createdBy: { firstName: 'Sam', lastName: 'Tan' },
    template: { id: 'template-1', name: 'Board Minutes', category: 'CORPORATE' },
    _count: { comments: 0, drafts: 0 },
    ...overrides,
  };
}

describe('DocumentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Vault-style inline filters above their matching columns', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentTable
        documents={[documentFixture()]}
        filters={{}}
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />,
    );

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[0]).toHaveAttribute('data-filter-row');
    expect(rows[1]).toHaveAttribute('data-column-header-row');
    expect(within(rows[1]).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Document', 'Company', 'Template', 'Status', 'Created By', 'Updated', 'Actions']);

    expect(within(rows[0]).getByRole('textbox', { name: 'Filter documents by title' })).toBeInTheDocument();
    expect(within(rows[0]).getByPlaceholderText('All companies')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('combobox', { name: 'All templates' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('combobox', { name: 'All statuses' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('textbox', { name: 'Filter documents by creator' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize Document column' })).toBeInTheDocument();

    fireEvent.change(
      within(rows[0]).getByRole('textbox', { name: 'Filter documents by title' }),
      { target: { value: 'minutes' } },
    );
    expect(onFilterChange).toHaveBeenCalledWith({ title: 'minutes' });
  });

  it('shows template names in their own column', () => {
    render(
      <DocumentTable
        documents={[documentFixture()]}
        filters={{}}
        templateOptions={[{ value: 'template-1', label: 'Board Minutes' }]}
      />,
    );

    const bodyRows = screen.getAllByRole('row').slice(2);
    const dataCells = within(bodyRows[0]).getAllByRole('cell');
    expect(dataCells[2]).toHaveTextContent('Board Minutes');
    expect(dataCells[0]).not.toHaveTextContent('Board Minutes');
  });

  it('resizes columns with the same Vault-style resize handles', () => {
    render(
      <DocumentTable
        documents={[documentFixture()]}
        filters={{}}
      />,
    );

    const table = screen.getByRole('table');
    expect(table).toHaveStyle({ width: '1150px', minWidth: '1150px' });

    const handle = screen.getByRole('separator', { name: 'Resize Document column' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    expect(table).toHaveStyle({ width: '1160px', minWidth: '1160px' });
  });

  it('uses the Document Vault alternate-row surface', () => {
    render(
      <DocumentTable
        documents={[
          documentFixture(),
          documentFixture({ id: 'doc-2', title: 'Second document' }),
        ]}
        filters={{}}
      />,
    );

    const bodyRows = screen.getAllByRole('row').slice(2);
    expect(bodyRows[0]).not.toHaveClass('bg-oak-row-alt');
    expect(bodyRows[1]).toHaveClass('bg-oak-row-alt', 'hover:bg-oak-row-alt-hover');
  });

  it('opens the document detail page from a desktop row click', () => {
    render(
      <DocumentTable
        documents={[documentFixture()]}
        filters={{}}
      />,
    );

    const bodyRows = screen.getAllByRole('row').slice(2);
    fireEvent.click(bodyRows[0]);

    expect(routerPush).toHaveBeenCalledWith('/generated-documents/doc-1');
  });

  it('resumes generation sessions from a row click instead of the detail page', () => {
    render(
      <DocumentTable
        documents={[documentFixture({
          metadata: {
            generationSession: {
              version: 2,
              currentStep: 2,
              templateId: '11111111-1111-4111-8111-111111111111',
              companyId: '22222222-2222-4222-8222-222222222222',
              contactIds: [],
              selectedDirectorId: null,
              selectedShareholderId: null,
              selectedContactId: null,
              serviceAgreementId: null,
              title: 'Annual minutes',
              customData: {},
              useLetterhead: true,
              previewContent: '<p>Draft</p>',
              editedContent: null,
              editedContentJson: null,
            },
          },
        })]}
        filters={{}}
      />,
    );

    const bodyRows = screen.getAllByRole('row').slice(2);
    fireEvent.click(bodyRows[0]);

    expect(routerPush).toHaveBeenCalledWith('/generated-documents/generate?draft=doc-1');
  });
});
