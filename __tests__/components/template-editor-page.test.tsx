import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import { commitTemplateFormChange } from '@/components/documents/template-editor/template-editor-state';
import {
  flushA4Reflow,
  installDeterministicA4Measurement,
} from '../helpers/a4-editor-test-utils';

const hoisted = vi.hoisted(() => {
  const layout: A4DocumentLayout = {
    version: 1,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11pt',
    lineHeight: 1.5,
    paragraphSpacing: '0.5em',
    marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
  };
  const state: {
    existingTemplate: Record<string, unknown> | null;
    updateMutation: { mutateAsync: ReturnType<typeof vi.fn> };
  } = {
    existingTemplate: {
      id: 'template-1',
      name: 'Agreement',
      description: '',
      category: 'OTHER',
      compositionType: 'STANDARD',
      content:
        '<p>{{company.name}}</p><p>{{custom.agreementDate}}</p><p>{{custom.termMonths}}</p>',
      isActive: true,
      contentJson: {
        existingMetadata: { keep: true },
        version: 1,
        layout,
      },
      placeholders: [
        {
          key: 'custom.agreementDate',
          label: 'Agreement date',
          type: 'text',
          required: false,
          source: 'custom',
        },
      ],
    },
    updateMutation: { mutateAsync: vi.fn() },
  };
  return state;
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) =>
      key === 'id' ? 'template-1' : key === 'type' ? 'template' : null,
  }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({
    data: {
      user: { id: 'user-1', isSuperAdmin: false },
      tenantId: 'tenant-1',
    },
    status: 'authenticated',
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => 'tenant-1',
}));

vi.mock('@/components/documents/ai-sidebar', () => ({
  useAISidebar: () => ({ context: {} }),
  AISidebar: () => null,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => hoisted.updateMutation,
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = String(queryKey[0]);
    if (key === 'document-template') {
      return { data: hoisted.existingTemplate, isLoading: false };
    }
    if (key === 'template-partials') {
      return { data: { partials: [] }, isLoading: false };
    }
    if (key === 'companies-list') {
      return { data: { companies: [] }, isLoading: false };
    }
    return { data: null, isLoading: false };
  },
}));

import TemplateEditorPage from '@/app/(dashboard)/template-partials/editor/page';

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

  it('drafts, saves, and reopens a template with one canonical content copy', async () => {
    hoisted.updateMutation.mutateAsync.mockReset();
    hoisted.updateMutation.mutateAsync.mockResolvedValue({});
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 6,
      blockHeight: 0,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(
      (...args) => {
        const message = args.map(String).join(' ');
        if (message.includes('not wrapped in act')) {
          throw new Error(`Unexpected React act warning: ${message}`);
        }
        if (message.includes('download the React DevTools')) return;
        throw new Error(`Unexpected console.error: ${message}`);
      },
    );

    try {
      const flush = async () => {
        await act(async () => {
          await flushA4Reflow();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          await flushA4Reflow();
        });
      };

      const firstRender = render(<TemplateEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByTestId('a4-page-content-1'),
        ).toHaveTextContent('{{company.name}}');
      });
      await flush();

      const surface = screen.getByTestId('a4-document-surface');
      const pageContent = screen.getByTestId('a4-page-content-1');
      const lines = Array.from(
        { length: 120 },
        (_, index) => `Draft line ${index + 1}`,
      );

      act(() => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(pageContent);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });
      act(() => {
        fireEvent.paste(pageContent, {
          clipboardData: {
            getData: (type: string) =>
              type === 'text/plain' ? lines.join('\n') : '',
          },
        });
      });
      await waitFor(() => {
        const content = screen.getByTestId('a4-document-surface').textContent ?? '';
        expect(content).toContain('Draft line 120');
      });
      await flush();

      const selectAll = () => {
        act(() => {
          surface.focus();
          surface.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'a',
              ctrlKey: true,
              bubbles: true,
            }),
          );
        });
      };
      const waitForIdle = async () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await flush();
          if (
            screen
              .getByTestId('a4-document-surface')
              .getAttribute('aria-busy') === 'false'
          ) {
            return;
          }
        }
      };
      selectAll();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
      });
      const formatsPopover = () =>
        screen.getByRole('dialog', { name: 'Formats popover' });
      selectAll();
      act(() => {
        fireEvent.change(
          within(formatsPopover()).getByLabelText('Font family'),
          {
            target: { value: 'Georgia, serif' },
          },
        );
      });
      await flush();
      selectAll();
      act(() => {
        fireEvent.change(within(formatsPopover()).getByLabelText('Font size'), {
          target: { value: '14pt' },
        });
      });
      await flush();
      selectAll();
      act(() => {
        fireEvent.change(
          within(formatsPopover()).getByLabelText('Text color'),
          {
            target: { value: '#ff0000' },
          },
        );
      });
      await flush();

      const topMargin = screen.getByLabelText('Top margin');
      act(() => {
        fireEvent.change(topMargin, { target: { value: '30' } });
        fireEvent.blur(topMargin);
      });
      const leftMargin = screen.getByLabelText('Left margin');
      act(() => {
        fireEvent.change(leftMargin, { target: { value: '25' } });
        fireEvent.blur(leftMargin);
      });
      await flush();

      let pageCount = screen.getAllByTestId(/a4-page-content-/).length;
      await waitForIdle();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add blank page' }));
      });
      const countAfterAddBlank = pageCount + 1;
      await waitFor(() => {
        expect(screen.getAllByTestId(/a4-page-content-/).length).toBe(
          countAfterAddBlank,
        );
      });
      await flush();
      await waitForIdle();
      act(() => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Delete current page' }),
        );
      });
      await waitFor(() => {
        expect(screen.getAllByTestId(/a4-page-content-/).length).toBe(
          pageCount,
        );
      });
      await flush();

      await waitForIdle();
      act(() => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Insert page break' }),
        );
      });
      await waitFor(() => {
        expect(screen.getAllByTestId(/a4-page-content-/).length).toBe(
          pageCount + 1,
        );
      });
      await flush();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Delete current page' }),
        ).not.toBeDisabled();
      });
      await flush();

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));
      });

      await waitFor(() => {
        expect(hoisted.updateMutation.mutateAsync).toHaveBeenCalled();
      });
      const payload = hoisted.updateMutation.mutateAsync.mock.calls[0][0] as {
        content: string;
        contentJson: Record<string, unknown> & {
          existingMetadata: { keep: boolean };
          layout: { marginsMm: { top: number; left: number } };
        };
        placeholders: Array<{ key: string }>;
      };
      expect(payload.content.match(/Draft line 120/g)).toHaveLength(1);
      expect(payload.contentJson).toMatchObject({
        existingMetadata: { keep: true },
        layout: {
          marginsMm: { top: 30, left: 25 },
        },
      });
      expect(payload.content).toContain('Georgia, serif');
      expect(payload.content).toContain('color: rgb(255, 0, 0)');
      expect(payload.content).toContain('data-break-type="hard"');
      expect(
        payload.placeholders.some((placeholder) => placeholder.key === 'custom.termMonths'),
      ).toBe(true);

      hoisted.existingTemplate = {
        ...hoisted.existingTemplate,
        content: payload.content,
        contentJson: payload.contentJson,
        placeholders: payload.placeholders,
      };
      hoisted.updateMutation.mutateAsync.mockReset();
      act(() => firstRender.unmount());

      const { unmount } = render(<TemplateEditorPage />);
      await waitFor(() => {
        expect(
          screen.getByTestId('a4-document-surface').textContent,
        ).toContain('Draft line 120');
      });
      await flush();
      expect(
        new DOMParser()
          .parseFromString(
            screen.getByTestId('a4-document-surface').textContent ?? '',
            'text/html',
          )
          .body.textContent?.match(/Draft line 120/g),
      ).toHaveLength(1);
      expect(screen.getByLabelText('Top margin')).toHaveValue(30);
      expect(screen.getByLabelText('Left margin')).toHaveValue(25);

      act(() => unmount());
    } finally {
      consoleError.mockRestore();
      restoreMeasurement();
    }
  }, 30_000);
});
