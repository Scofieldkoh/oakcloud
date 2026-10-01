import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolutionWorkspaceState } from '@/types/document-generation-batch';

const partialsQuery = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/use-template-partials', () => ({
  useAllTemplatePartials: () => partialsQuery.value,
}));
vi.mock('@/hooks/use-auth', () => ({ useSession: () => ({ data: { tenantId: 'tenant-1', isSuperAdmin: false } }) }));
vi.mock('@/components/ui/workspace-selector', () => ({ useActiveWorkspaceId: () => 'tenant-1' }));

import { ResolutionSectionsConfig } from '@/components/documents/generation-batch/resolution-sections-config';

const partial = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'appointment-of-secretary',
  displayName: 'Appointment of Secretary',
  description: null,
  placeholders: [],
  version: 2,
  documentEngine: 'OAKDOC' as const,
};

let latest: ResolutionWorkspaceState | null = null;
function Harness({ initial }: { initial: ResolutionWorkspaceState }) {
  const [value, setValue] = useState(initial);
  return (
    <ResolutionSectionsConfig
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
}

beforeEach(() => {
  latest = null;
  partialsQuery.value = { data: { partials: [partial] }, isLoading: false, error: null };
});

describe('ResolutionSectionsConfig', () => {
  it('adds custom resolutions numbered in order and asks for their text', () => {
    render(<Harness initial={{ subject: '', sections: [] }} />);
    expect(screen.getByText('At least one resolution required')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add custom resolution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add custom resolution' }));
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(screen.getByText('4 to fix')).toBeTruthy();

    const [first, second] = screen.getAllByRole('listitem');
    fireEvent.change(within(first).getByLabelText('Heading'), { target: { value: 'APPOINTMENT OF SECRETARY' } });
    fireEvent.change(within(first).getByLabelText('Resolution 1 text'), { target: { value: 'RESOLVED that A be appointed.' } });
    fireEvent.change(within(second).getByLabelText('Heading'), { target: { value: 'LODGEMENT' } });
    fireEvent.change(within(second).getByLabelText('Resolution 2 text'), { target: { value: 'RESOLVED that forms be lodged.' } });
    expect(screen.getByText('2 resolutions')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move resolution 2 up' }));
    expect(latest?.sections.map((section) => section.heading)).toEqual(['LODGEMENT', 'APPOINTMENT OF SECRETARY']);
  });

  it('lists a saved partial with its name as the default heading', () => {
    render(<Harness
      initial={{
        subject: 'CHANGE IN COMPANY SECRETARY',
        sections: [{ id: 'a', kind: 'PARTIAL', heading: 'APPOINTMENT OF SECRETARY', partialId: partial.id }],
      }}
    />);
    expect(screen.getByText(/Partial: Appointment of Secretary/)).toBeTruthy();
    expect(screen.getByDisplayValue('CHANGE IN COMPANY SECRETARY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove resolution 1' }));
    expect(latest?.sections).toEqual([]);
  });
});
