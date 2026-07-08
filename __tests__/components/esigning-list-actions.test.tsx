import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryWarningBadge, EnvelopeActionsDropdown } from '@/components/esigning/esigning-list-page';
import type { EsigningEnvelopeListItem } from '@/types/esigning';

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
    canRetryPdf: false,
    emailDelivery: {
      status: 'ok',
      lastFailureAt: null,
      failures: [],
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

  it('shows an email failure badge when envelope email delivery failed', () => {
    render(<EmailDeliveryWarningBadge envelope={envelope({
      emailDelivery: {
        status: 'failed',
        lastFailureAt: '2026-06-30T10:00:00.000Z',
        failures: [
          {
            kind: 'request',
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
});
