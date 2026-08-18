import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  useDeadlineRules: vi.fn(),
  useDeadlineRule: vi.fn(),
  useCreateDeadlineRule: vi.fn(),
  useUpdateDeadlineRule: vi.fn(),
  usePreviewDeadlineRuleImpact: vi.fn(),
  usePublishDeadlineRule: vi.fn(),
  useArchiveDeadlineRule: vi.fn(),
}));

vi.mock('@/hooks/use-deadline-rules', () => hooks);

import { DeadlineRulesPanel } from '@/components/services/admin/deadline-rules-panel';

const rule = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  code: 'ANNUAL_RETURN',
  name: 'Annual Return',
  description: 'Annual return cycle',
  isActive: true,
  archivedAt: null,
  archivedById: null,
  archiveReason: null,
  currentVersionId: '33333333-3333-4333-8333-333333333333',
  currentVersion: {
    id: '33333333-3333-4333-8333-333333333333',
    ruleId: '11111111-1111-4111-8111-111111111111',
    version: 4,
    state: 'PUBLISHED' as const,
    schemaVersion: 1,
    recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
    applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
    configHash: 'a'.repeat(64),
    draftRevision: 3,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedById: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    parameters: [],
    milestones: [{
      id: '44444444-4444-4444-8444-444444444444',
      key: 'annual-return-due',
      name: 'Annual return due',
      description: null,
      type: 'STATUTORY' as const,
      generationMode: 'ONCE_PER_CYCLE' as const,
      expression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'nextArDueDate' } },
      businessDayAdjustment: 'NONE' as const,
      displayOrder: 0,
      isActive: true,
    }],
  },
  draft: {
    id: '55555555-5555-4555-8555-555555555555',
    ruleId: '11111111-1111-4111-8111-111111111111',
    version: 0,
    state: 'DRAFT' as const,
    schemaVersion: 1,
    recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
    applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
    configHash: 'b'.repeat(64),
    draftRevision: 4,
    publishedAt: null,
    publishedById: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    parameters: [],
    milestones: [{
      id: '66666666-6666-4666-8666-666666666666',
      key: 'annual-return-due',
      name: 'Annual return due',
      description: null,
      type: 'STATUTORY' as const,
      generationMode: 'ONCE_PER_CYCLE' as const,
      expression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'nextArDueDate' } },
      businessDayAdjustment: 'NONE' as const,
      displayOrder: 0,
      isActive: true,
    }],
  },
  versions: [],
  variantAssociations: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null });

describe('DeadlineRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.useDeadlineRules.mockReturnValue({
      data: { rules: [rule], total: 1, page: 1, limit: 20 },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    hooks.useDeadlineRule.mockReturnValue({ data: rule, isLoading: false, error: null });
    hooks.useCreateDeadlineRule.mockReturnValue(mutation());
    hooks.useUpdateDeadlineRule.mockReturnValue(mutation());
    hooks.usePreviewDeadlineRuleImpact.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        ruleId: rule.id,
        operation: 'PUBLISH',
        currentPublishedVersion: 4,
        draftRevision: 4,
        draftConfigHash: 'b'.repeat(64),
        previewFingerprint: 'c'.repeat(64),
        counts: {
          created: 0,
          recalculated: 2,
          cancelled: 0,
          preserved: 4,
          inapplicable: 0,
          missingInput: 0,
          conflicts: 0,
          warnings: 0,
        },
        samples: [],
        sourceState: {
          currentVersionId: rule.currentVersionId,
          draftId: rule.draft!.id,
          draftState: 'DRAFT',
          isActive: true,
          archivedAt: null,
        },
      }),
      isPending: false,
      error: null,
    });
    hooks.usePublishDeadlineRule.mockReturnValue(mutation());
    hooks.useArchiveDeadlineRule.mockReturnValue(mutation());
  });

  it('renders a searchable rule list and current published version history', () => {
    render(<DeadlineRulesPanel workspaceId="22222222-2222-4222-8222-222222222222" />);

    expect(screen.getByRole('heading', { name: 'Deadline rules' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search deadline rules' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Annual ReturnActive/ })).toBeVisible();
    expect(screen.getByText('No immutable versions yet.')).toBeVisible();
    expect(screen.getByText('Immutable version history')).toBeVisible();
  });

  it('requires a current impact preview before publishing', async () => {
    render(<DeadlineRulesPanel workspaceId="22222222-2222-4222-8222-222222222222" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Annual Return' }));
    const publish = screen.getByRole('button', { name: 'Publish rule' });
    expect(publish).toBeDisabled();

    const previewButton = screen.getByRole('button', { name: 'Preview impact' });
    fireEvent.click(previewButton);
    const mutationResult = hooks.usePreviewDeadlineRuleImpact.mock.results[0]?.value;
    await waitFor(() => expect(mutationResult?.mutateAsync).toHaveBeenCalled());
    expect(screen.getByText('Recalculated')).toBeVisible();
    expect(publish).toBeEnabled();
  });

  it('invalidates the preview gate when a draft field changes', async () => {
    render(<DeadlineRulesPanel workspaceId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Annual Return' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview impact' }));
    const publish = screen.getByRole('button', { name: 'Publish rule' });
    await waitFor(() => expect(screen.getByText('Recalculated')).toBeVisible());
    expect(publish).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'Annual Return revised' },
    });
    await waitFor(() => expect(publish).toBeDisabled());
  });
});
