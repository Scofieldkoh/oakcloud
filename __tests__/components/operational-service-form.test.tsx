import { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationalServiceForm } from '@/components/companies/company-detail/operational-service-form';
import {
  type OperationalServiceValues,
  validateOperationalServiceValues,
} from '@/components/companies/company-detail/client-service-form-state';

const uuid = () => crypto.randomUUID();

function baseValues(): OperationalServiceValues {
  return {
    status: 'ACTIVE',
    serviceCadence: 'ANNUALLY',
    customCadenceLabel: '',
    startDate: '2026-08-01',
    endDate: '',
    fields: [{ uiId: uuid(), key: 'filingMonth', label: 'Filing month', type: 'text', value: 'July', catalogDerived: true }],
    fees: [{
      uiId: uuid(),
      id: 'fee-1',
      description: 'Annual service fee',
      amount: '1200.00',
      currency: 'SGD',
      billingFrequency: 'ANNUALLY',
      customFrequencyLabel: '',
      billingStartDate: '',
      catalogDerived: true,
    }],
  };
}

function Harness({ initial, errors }: { initial: OperationalServiceValues; errors?: Record<string, string | undefined> }) {
  const [values, setValues] = useState(initial);
  useEffect(() => { setValues(initial); }, [initial]);
  return <OperationalServiceForm values={values} onChange={setValues} errors={errors ?? {}} />;
}

describe('OperationalServiceForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates status, cadence, and dates through controlled changes', () => {
    render(<Harness initial={baseValues()} />);
    const status = screen.getByLabelText('Status');
    fireEvent.change(status, { target: { value: 'PAUSED' } });
    expect(status).toHaveValue('PAUSED');
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'MONTHLY' } });
    expect(screen.getByLabelText('Cadence')).toHaveValue('MONTHLY');
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-01');
  });

  it('shows the custom cadence control only for custom cadence', () => {
    const { rerender } = render(<Harness initial={baseValues()} />);
    expect(screen.queryByLabelText('Custom cadence')).not.toBeInTheDocument();
    const custom = { ...baseValues(), serviceCadence: 'CUSTOM' as const };
    rerender(<Harness initial={custom} />);
    expect(screen.getByLabelText('Custom cadence')).toBeVisible();
  });

  it('adds and removes optional service fields', () => {
    render(<Harness initial={baseValues()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getByLabelText('Field 2 name')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(screen.queryByLabelText('Field 2 name')).not.toBeInTheDocument();
  });

  it('adds fees and protects the last remaining fee row', () => {
    render(<Harness initial={baseValues()} />);
    expect(screen.getByRole('button', { name: 'Remove fee' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add fee' }));
    expect(screen.getByLabelText('Fee 2 description')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Remove fee' })[0]).toBeEnabled();
  });

  it('rejects blank frequencies and blank or negative amounts while accepting 0.00', () => {
    const values = baseValues();
    const errors = validateOperationalServiceValues(values);
    expect(Object.values(errors).filter(Boolean)).toHaveLength(0);

    expect(Object.values(validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], amount: '' }],
    })).filter(Boolean)).not.toHaveLength(0);
    expect(Object.values(validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], amount: '-1.00' }],
    })).filter(Boolean)).not.toHaveLength(0);
    expect(Object.values(validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], billingFrequency: '' }],
    })).filter(Boolean)).not.toHaveLength(0);
    expect(Object.values(validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], amount: '0.00' }],
    })).filter(Boolean)).toHaveLength(0);
  });

  it('requires a custom frequency label for custom frequency', () => {
    const values = baseValues();
    const invalid = validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], billingFrequency: 'CUSTOM', customFrequencyLabel: '' }],
    });
    expect(invalid[`fee-${values.fees[0].uiId}-custom-frequency`]).toBeTruthy();

    const valid = validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], billingFrequency: 'CUSTOM', customFrequencyLabel: 'Every 18 months' }],
    });
    expect(valid[`fee-${values.fees[0].uiId}-custom-frequency`]).toBeUndefined();
  });

  it('associates field-addressable errors with their controls', () => {
    const values = baseValues();
    const feeId = values.fees[0].uiId;
    render(<Harness initial={values} errors={{ [`fee-${feeId}-amount`]: 'Enter a non-negative amount with at most two decimals.' }} />);
    const amount = screen.getByLabelText('Fee 1 amount');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    const errorId = amount.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Enter a non-negative amount with at most two decimals.');
  });

  it('renders catalog labels and type-appropriate field controls', () => {
    const values: OperationalServiceValues = {
      ...baseValues(),
      fields: [
        { uiId: 'text', key: 'software', label: 'Accounting software', type: 'text', value: 'Xero', catalogDerived: true },
        { uiId: 'date', key: 'renewalDate', label: 'Renewal date', type: 'date', value: '2026-08-01', catalogDerived: true },
        { uiId: 'number', key: 'headcount', label: 'Headcount', type: 'number', value: '25', catalogDerived: true },
        { uiId: 'currency', key: 'budget', label: 'Budget', type: 'currency', value: '1200.00', catalogDerived: true },
        { uiId: 'boolean', key: 'gstRegistered', label: 'GST registered', type: 'boolean', value: 'true', catalogDerived: true },
        { uiId: 'textarea', key: 'notes', label: 'Service notes', type: 'textarea', value: 'Priority filing', catalogDerived: true },
      ],
    };
    render(<Harness initial={values} />);

    expect(screen.getByLabelText('Renewal date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Headcount')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByLabelText('Budget')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByLabelText('GST registered').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Service notes').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Accounting software')).toHaveValue('Xero');
  });

  it('associates catalog field errors with the matching field control', () => {
    const values: OperationalServiceValues = {
      ...baseValues(),
      fields: [{ uiId: 'software', key: 'software', label: 'Software', type: 'text', value: '', catalogDerived: true }],
    };
    render(<Harness initial={values} errors={{ 'field-software-value': 'Enter a value.' }} />);
    const field = screen.getByLabelText('Software');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const errorId = field.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Enter a value.');
  });
});
