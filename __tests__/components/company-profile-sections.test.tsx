import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyProfileSections } from '@/components/companies/company-detail/company-profile-sections';

const company = {
  id: 'company-1', tenantId: 'tenant-1', uen: '202400001A', name: 'Example Pte. Ltd.',
  entityType: 'PRIVATE_LIMITED', status: 'LIVE', homeCurrency: 'SGD',
  financialYearEndDay: 31, financialYearEndMonth: 12,
  paidUpCapitalCurrency: 'SGD', paidUpCapitalAmount: 100000,
  issuedCapitalCurrency: 'SGD', issuedCapitalAmount: 100000,
  primarySsicCode: '69202', primarySsicDescription: 'Book-keeping services',
  secondarySsicCode: '70201', secondarySsicDescription: 'Management consultancy',
  addresses: [
    { id: 'a1', addressType: 'REGISTERED_OFFICE', streetName: 'Anson Road', postalCode: '079903', country: 'Singapore', fullAddress: '10 Anson Road, Singapore 079903', isCurrent: true, effectiveFrom: new Date('2024-03-18') },
    { id: 'a2', addressType: 'MAILING', streetName: 'Raffles Place', postalCode: '048616', country: 'Singapore', fullAddress: '1 Raffles Place, Singapore 048616', isCurrent: true },
  ],
  officers: [
    { id: 'o1', name: 'Tan Mei Ling', role: 'DIRECTOR', appointmentDate: new Date('2024-03-18'), isCurrent: true },
    { id: 'o2', name: 'Past Director', role: 'DIRECTOR', cessationDate: new Date('2023-01-01'), isCurrent: false },
  ],
  shareholders: [
    { id: 's1', name: 'Tan Mei Ling', shareholderType: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 60000, percentageHeld: 60, currency: 'SGD', isCurrent: true },
    { id: 's2', name: 'Former Owner', shareholderType: 'CORPORATE', shareClass: 'ORDINARY', numberOfShares: 1000, percentageHeld: 1, currency: 'SGD', isCurrent: false },
  ],
  shareCapital: [{ id: 'c1', shareClass: 'ORDINARY', currency: 'SGD', numberOfShares: 100000, totalValue: 100000, isPaidUp: true, isTreasury: false }],
  charges: [
    { id: 'ch1', chargeHolderName: 'Oak Bank', isFullyDischarged: false },
    { id: 'ch2', chargeHolderName: 'Old Bank', isFullyDischarged: true, dischargeDate: new Date('2020-01-01') },
  ],
  formerNames: [{ id: 'f1', formerName: 'Old Example Pte. Ltd.', effectiveFrom: new Date('2020-01-01') }],
  auditor: { name: 'Oak Audit LLP', address: '3 Audit Street', appointmentDate: new Date('2021-01-01') },
} as never;

describe('CompanyProfileSections', () => {
  it('renders the approved priority order and normalized current details', () => {
    render(<CompanyProfileSections company={company} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Addresses', 'Business activities', 'Officers', 'Shareholders',
      'Additional company information', 'Compliance', 'Capital', 'Charges',
    ]);
    expect(screen.getByText(/10 Anson Road, Singapore 079903/)).toHaveTextContent('effective from: 18 March 2024');
    expect(screen.getByText('Tan Mei Ling (60% ownership)')).toBeInTheDocument();
    expect(screen.getByText('SGD 60,000.00 / 60,000 Ordinary Shares')).toBeInTheDocument();
    expect(screen.getByText('Individual')).toBeInTheDocument();
    expect(screen.getByText('Director')).toBeInTheDocument();
    expect(screen.queryByText('Past Director')).not.toBeInTheDocument();
    expect(screen.queryByText('Former Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Bank')).not.toBeInTheDocument();
  });

  it('reveals past records in their own segments', () => {
    render(<CompanyProfileSections company={company} />);
    fireEvent.click(screen.getByLabelText('Show ceased'));
    fireEvent.click(screen.getByLabelText('Show former'));
    fireEvent.click(screen.getByLabelText('Show discharged'));
    expect(screen.getByText('Past Director')).toBeInTheDocument();
    expect(screen.getByText('Former Owner (1% ownership)')).toBeInTheDocument();
    expect(screen.getByText('Old Bank')).toBeInTheDocument();
  });
});
