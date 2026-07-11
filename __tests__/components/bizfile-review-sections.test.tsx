import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BizFileReviewDraft, BizFileReviewSectionId } from '@/lib/validations/bizfile-review';
import { BizFileReviewSections } from '@/components/companies/bizfile-review/bizfile-review-sections';

const fullDraft: BizFileReviewDraft = {
  entityDetails: { uen: '202400001A', name: 'Example Pte. Ltd.', formerName: 'Old Example', dateOfNameChange: '2024-01-01', formerNames: [{ name: 'First Example', effectiveFrom: '2020-01-01', effectiveTo: '2023-12-31' }], entityType: 'PRIVATE_LIMITED', status: 'LIVE', statusDate: '2024-01-02', incorporationDate: '2020-01-01', registrationDate: '2020-01-02' },
  ssicActivities: { primary: { code: '62011', description: 'Software development' }, secondary: { code: '62019', description: 'Other IT' } },
  registeredAddress: { block: '1', streetName: 'Oak Street', level: '02', unit: '03', buildingName: 'Oak House', postalCode: '123456', country: 'SG', effectiveFrom: '2020-01-01' },
  mailingAddress: { block: '2', streetName: 'Mail Street', level: '03', unit: '04', buildingName: 'Mail House', postalCode: '654321', country: 'SG' },
  paidUpCapital: { amount: 1000, currency: 'SGD' }, issuedCapital: { amount: 1200, currency: 'SGD' },
  shareCapital: [{ shareClass: 'ORDINARY', currency: 'SGD', numberOfShares: 1000, parValue: 1, totalValue: 1000, isPaidUp: true, isTreasury: false }],
  treasuryShares: { numberOfShares: 10, currency: 'SGD' }, homeCurrency: 'SGD',
  officers: [{ name: 'Alex Tan', role: 'DIRECTOR', identificationType: 'NRIC', identificationNumber: 'S1234567A', nationality: 'SG', address: '1 Oak Street', appointmentDate: '2020-01-01', cessationDate: '2025-01-01' }],
  shareholders: [{ name: 'Jamie Lim', type: 'INDIVIDUAL', identificationType: 'NRIC', identificationNumber: 'S7654321A', nationality: 'SG', placeOfOrigin: 'Singapore', address: '2 Oak Street', shareClass: 'ORDINARY', numberOfShares: 1000, percentageHeld: 100, currency: 'SGD' }],
  auditor: { name: 'Audit LLP', address: '3 Oak Street', appointmentDate: '2021-01-01' },
  financialYear: { endDay: 31, endMonth: 12, fyeAsAtLastAr: '2024-12-31' },
  compliance: { lastAgmDate: '2025-05-01', lastArFiledDate: '2025-06-01', accountsDueDate: '2025-07-01', fyeAsAtLastAr: '2024-12-31' },
  charges: [{ chargeNumber: 'C1', chargeType: 'FIXED', description: 'Bank charge', chargeHolderName: 'Oak Bank', amountSecured: 5000, amountSecuredText: 'Five thousand', currency: 'SGD', registrationDate: '2022-01-01', dischargeDate: '2026-01-01' }],
  documentMetadata: { receiptNo: 'ACRA123', receiptDate: '2025-01-01' },
};

function view(draft: BizFileReviewDraft, activeSection: BizFileReviewSectionId, onChange = vi.fn()) {
  return render(<BizFileReviewSections draft={draft} onChange={onChange} activeSection={activeSection} issues={[]} />);
}

describe('BizFileReviewSections', () => {
  it('renders and edits the complete extraction field surface', () => {
    const onChange = vi.fn();
    let result = view(fullDraft, 'entity', onChange);
    expect(screen.getByLabelText('Former names')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Corrected Pte. Ltd.' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ entityDetails: expect.objectContaining({ name: 'Corrected Pte. Ltd.' }) }));
    result.unmount();

    for (const [section, label] of [['addresses', 'Mailing street'], ['capital', 'Treasury shares'], ['officers', 'Identification number'], ['compliance', 'FYE as at last AR'], ['charges', 'Charge holder'], ['document', 'Receipt number']] as const) {
      result = view(fullDraft, section);
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      result.unmount();
    }
  });

  it('keeps blank optional singleton groups editable', () => {
    const empty: BizFileReviewDraft = { entityDetails: { uen: '', name: '', entityType: '', status: '' } };
    let result = view(empty, 'addresses');
    expect(screen.getByLabelText('Mailing address')).toBeInTheDocument();
    result.unmount();
    result = view(empty, 'auditor');
    expect(screen.getByLabelText('Auditor')).toBeInTheDocument();
    result.unmount();
  });
});
