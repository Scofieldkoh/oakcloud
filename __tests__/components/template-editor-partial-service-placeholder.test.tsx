import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams('type=partial&id=partial-1'),
}));
vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({
    data: {
      id: 'user-1',
      tenantId: 'tenant-1',
      isSuperAdmin: false,
    },
  }),
}));
vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => 'tenant-1',
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn() }),
}));
vi.mock('@/components/documents/ai-sidebar', () => ({
  AISidebar: () => null,
  useAISidebar: () => ({ context: {} }),
}));
vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: forwardRef(({ value }: { value: string }, _ref) => (
    <div data-testid="editor-content">{value}</div>
  )),
}));
vi.mock('@/components/documents/template-editor/placeholder-panel', () => ({
  PlaceholderPanel: () => null,
}));
vi.mock('@/components/documents/template-editor/template-editor-panel', () => ({
  TemplateEditorPanel: ({
    partialForm,
    onPartialChange,
    validationIssues,
  }: {
    partialForm: { displayName: string };
    onPartialChange: (changes: { displayName: string }) => void;
    validationIssues: Array<{ message: string }>;
  }) => (
    <div>
      <div data-testid="validation-issues">
        {validationIssues.map((issue) => issue.message).join('|')}
      </div>
      <button
        type="button"
        onClick={() => onPartialChange({ displayName: `${partialForm.displayName} updated` })}
      >
        Change display name
      </button>
    </div>
  ),
}));

import TemplateEditorPage from '@/app/(dashboard)/template-partials/editor/page';

const serviceDefinition = {
  key: 'service.fields.software',
  label: 'Accounting software',
  type: 'textarea',
  source: 'service',
  path: 'service.fields.software',
  category: 'service',
  required: false,
  futureMetadata: { retained: true },
};

describe('partial editor service-placeholder integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads, validates, and saves a declared service field without changing its definition', async () => {
    let savedBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/template-partials/partial-1')) {
        if (init?.method === 'PATCH') {
          savedBody = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ id: 'partial-1' }), { status: 200 });
        }
        return new Response(JSON.stringify({
          id: 'partial-1',
          name: 'accounting-sow',
          displayName: 'Accounting SOW',
          description: 'Reusable scope',
          content: '<p>Software: {{service.fields.software}}</p>',
          placeholders: [serviceDefinition],
        }), { status: 200 });
      }
      if (url.includes('/api/template-partials?')) {
        return new Response(JSON.stringify({ partials: [] }), { status: 200 });
      }
      if (url.includes('/api/companies/options?')) {
        return new Response(JSON.stringify({ options: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TemplateEditorPage />
      </QueryClientProvider>,
    );

    const saveButton = await screen.findByRole('button', { name: 'Save Partial' });
    await waitFor(() => {
      expect(screen.getByTestId('editor-content')).toHaveTextContent(
        '{{service.fields.software}}',
      );
      expect(screen.getByTestId('validation-issues')).toBeEmptyDOMElement();
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change display name' }));
    fireEvent.click(saveButton);

    await waitFor(() => expect(savedBody).toBeDefined());
    expect(savedBody).toMatchObject({
      displayName: 'Accounting SOW updated',
      content: '<p>Software: {{service.fields.software}}</p>',
      placeholders: [serviceDefinition],
    });
  });

  it('keeps undeclared service fields as blocking validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/template-partials/partial-1')) {
        return new Response(JSON.stringify({
          id: 'partial-1',
          name: 'accounting-sow',
          displayName: 'Accounting SOW',
          content: '<p>{{service.fields.undeclared}}</p>',
          placeholders: [],
        }), { status: 200 });
      }
      if (url.includes('/api/template-partials?')) {
        return new Response(JSON.stringify({ partials: [] }), { status: 200 });
      }
      if (url.includes('/api/companies/options?')) {
        return new Response(JSON.stringify({ options: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TemplateEditorPage />
      </QueryClientProvider>,
    );

    const saveButton = await screen.findByRole('button', { name: 'Save Partial' });
    await waitFor(() => {
      expect(screen.getByTestId('validation-issues')).toHaveTextContent(
        'Placeholder "service.fields.undeclared" is not available',
      );
      expect(saveButton).toBeDisabled();
    });
  });
});
