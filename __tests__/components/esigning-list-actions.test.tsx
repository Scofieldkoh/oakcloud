import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailDeliveryWarningBadge,
  EnvelopeActionsDropdown,
  EsigningListPage,
} from '@/components/esigning/esigning-list-page';
import { CopyDeliveryStatusBadge } from '@/components/esigning/esigning-shared';
import type { EsigningEnvelopeListItem } from '@/types/esigning';

const mocks = vi.hoisted(() => ({
  createEnvelope: vi.fn(() => new Promise(() => undefined)),
  preparation: null as null | Record<string, unknown>,
  ensurePreparation: vi.fn(async () => ({
    id: 'preparation-1',
    taskId: '11111111-1111-4111-8111-111111111111',
    taskStageId: '22222222-2222-4222-8222-222222222222',
    status: 'WAITING',
    blockingStage: {
      id: 'review-stage',
      name: 'Review',
      status: 'IN_PROGRESS',
    },
    generatedDocumentId: 'document-1',
    esigningEnvelopeId: null,
    lastError: null,
  })),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({
    taskId: '11111111-1111-4111-8111-111111111111',
    taskStageId: '22222222-2222-4222-8222-222222222222',
    returnTo: '/tasks',
  }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({
    data: {
      id: 'user-1',
      tenantId: 'workspace-1',
      isSuperAdmin: false,
    },
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: {
      readEsigning: true,
      createEsigning: true,
    },
  }),
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('@/components/esigning/esigning-upload-files', () => ({
  isAllowedEsigningUploadFile: () => true,
  useEsigningWordUploadAvailability: () => false,
}));

vi.mock('@/hooks/use-esigning', () => ({
  useCreateEsigningEnvelope: () => ({ mutateAsync: mocks.createEnvelope }),
  useDeleteEsigningEnvelope: () => ({ mutateAsync: vi.fn() }),
  useDuplicateEsigningEnvelope: () => ({ mutateAsync: vi.fn() }),
  useEsigningEnvelopes: () => ({
    data: {
      envelopes: [],
      total: 0,
      statusCounts: {
        DRAFT: 0,
        SENT: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        VOIDED: 0,
        DECLINED: 0,
        EXPIRED: 0,
      },
    },
  }),
  useResendEsigningEnvelope: () => ({ mutateAsync: vi.fn() }),
  useRetryEsigningEnvelopeProcessing: () => ({ mutateAsync: vi.fn() }),
  uploadEsigningDocumentRequest: vi.fn(),
  useVoidEsigningEnvelope: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useTaskEsigningPreparation: () => ({ data: mocks.preparation, isLoading: false }),
  useEnsureTaskEsigningPreparation: () => ({
    data: null,
    isPending: false,
    mutateAsync: mocks.ensurePreparation,
  }),
  useRetryTaskEsigningPreparation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('@/components/ui/dropdown', () => ({
  Dropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownSeparator: () => <hr />,
}));

function envelope(overrides: Partial<EsigningEnvelopeListItem> = {}): EsigningEnvelopeListItem {
  return {
    id: 'envelope-1',
    tenantId: 'workspace-1',
    title: 'NDA',
    status: 'COMPLETED',
    pdfGenerationStatus: 'COMPLETED',
    signingOrder: 'PARALLEL',
    certificateId: 'certificate-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    completedAt: '2026-06-02T00:00:00.000Z',
    expiresAt: null,
    companyId: null,
    companyName: null,
    createdById: 'user-1',
    createdByName: 'Sender',
    canDelete: false,
    canVoid: false,
    canDuplicate: true,
    canResend: false,
    canRetryCompletionProcessing: false,
    emailDelivery: {
      status: 'ok',
      lastFailureAt: null,
      failures: [],
    },
    postCompletion: {
      artifactStatus: 'COMPLETED',
      autoFilingStatus: 'COMPLETED',
      completionDeliveryStatus: 'NOT_TRACKED',
      failedCompletionDeliveryCount: 0,
    },
    resendableRecipientCount: 0,
    recipientCount: 1,
    signerCount: 1,
    documentCount: 1,
    recipients: [],
    ...overrides,
  };
}

describe('EnvelopeActionsDropdown', () => {
  it('shows duplicate action when the envelope can be duplicated', () => {
    render(
      <EnvelopeActionsDropdown
        envelope={envelope()}
        onDuplicate={vi.fn()}
        onResend={vi.fn()}
        onDelete={vi.fn()}
        onVoid={vi.fn()}
        onRetryPdf={vi.fn()}
        onDownload={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Duplicate envelope' })).toBeInTheDocument();
  });

  it('keeps an unrelated request failure visible after a successful reminder', () => {
    render(<EmailDeliveryWarningBadge envelope={envelope({
      emailDelivery: {
        status: 'failed',
        lastFailureAt: '2026-06-30T10:00:00.000Z',
        failures: [
          {
            kind: 'request',
            targetKey: 'recipient:signer-1',
            to: 'signer@example.com',
            subject: '[Oakcloud] Signature requested',
            error: 'SMTP rejected recipient',
            attemptedAt: '2026-06-30T10:00:00.000Z',
          },
        ],
      },
    })} />);

    expect(screen.getByText('Email failed')).toBeInTheDocument();
  });

  it('renders CC copy delivery as an independent outcome', () => {
    render(<CopyDeliveryStatusBadge status="SENT" />);
    expect(screen.getByText('Copy sent')).toBeInTheDocument();

    render(<CopyDeliveryStatusBadge status="FAILED" />);
    expect(screen.getByText('Copy failed')).toBeInTheDocument();
  });
});

describe('EsigningListPage task launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preparation = null;
  });

  it('ensures background preparation without creating a generic envelope', async () => {
    render(<EsigningListPage />);

    await waitFor(() => {
      expect(mocks.ensurePreparation).toHaveBeenCalledTimes(1);
    });
    expect(mocks.ensurePreparation).toHaveBeenCalledWith({
      taskId: '11111111-1111-4111-8111-111111111111',
      stageId: '22222222-2222-4222-8222-222222222222',
    });
    expect(mocks.createEnvelope).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('names the blocking review while preparation is waiting', () => {
    mocks.preparation = {
      id: 'preparation-1',
      taskId: '11111111-1111-4111-8111-111111111111',
      taskStageId: '22222222-2222-4222-8222-222222222222',
      status: 'WAITING',
      blockingStage: { id: 'review-1', name: 'Review', status: 'IN_PROGRESS' },
      generatedDocumentId: 'document-1',
      esigningEnvelopeId: null,
      lastError: null,
    };

    render(<EsigningListPage />);

    expect(screen.getByText('Complete or skip Review before the generated document is attached.'))
      .toBeInTheDocument();
  });

  it('offers retry only for retryable preparation failures', () => {
    mocks.preparation = {
      id: 'preparation-1',
      taskId: '11111111-1111-4111-8111-111111111111',
      taskStageId: '22222222-2222-4222-8222-222222222222',
      status: 'FAILED_RETRYABLE',
      blockingStage: null,
      generatedDocumentId: 'document-1',
      esigningEnvelopeId: null,
      lastError: 'Temporary storage failure',
    };

    render(<EsigningListPage />);

    expect(screen.getByRole('button', { name: 'Retry preparation' })).toBeInTheDocument();
    expect(screen.getByText('Temporary storage failure')).toBeInTheDocument();
  });
});
