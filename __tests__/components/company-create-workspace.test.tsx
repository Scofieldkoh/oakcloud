import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanyCreateWorkspace } from '@/components/companies/company-edit/company-create-workspace';

describe('CompanyCreateWorkspace', () => {
  it('mirrors every Edit Company profile section and submits the complete profile', () => {
    const onSubmit = vi.fn();

    render(<CompanyCreateWorkspace onSubmit={onSubmit} />);

    for (const heading of [
      'Identity',
      'Addresses',
      'Business activities',
      'Officers',
      'Shareholders',
      'Compliance',
      'Capital',
      'Charges',
      'Additional company information',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText('Uen'), { target: { value: '202400001A' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Example Pte. Ltd.' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add company' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({
        uen: '202400001A',
        name: 'Example Pte. Ltd.',
      }),
      officers: { officers: [] },
      shareholders: { shareholders: [] },
      charges: { charges: [] },
    }));
  });
});
