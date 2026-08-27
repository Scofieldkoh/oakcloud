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
    billingDisposition: 'CONFIGURED',
    billingNotRequiredReason: '',
    fields: [{ uiId: uuid(), key: 'filingMonth', label: 'Filing month', type: 'text', value: 'July', catalogDerived: true }],
    fees: [{
      uiId: uuid(),
      id: 'fee-1',
      description: 'Annual service fee',
      amount: '1200.00',
      currency: 'SGD',
      billingFrequency: 'ANNUALLY',
      customFrequencyLabel: '',
      billingStartDate: '2026-08-01',
      scheduleConfig: {
        schemaVersion: 1,
        cadence: 'ANNUALLY',
        startDate: '2026-08-01',
        customInterval: { unit: 'MONTH', count: 12 },
        scheduleEntries: [{
          key: 'default',
          label: 'Billing date',
          expression: { kind: 'DAY_OF_MONTH', day: 1 },
          businessDayAdjustment: 'NONE',
        }],
      },
      catalogDerived: true,
    }],
    deadlineRules: [],
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
    expect(screen.getByLabelText('Start date')).toHaveValue('1 Sep 2026');
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

  it('accepts custom frequency with interval months without requiring a manual label', () => {
    const values = baseValues();
    const valid = validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], billingFrequency: 'CUSTOM', customFrequencyLabel: '' }],
    });
    expect(valid[`fee-${values.fees[0].uiId}-custom-frequency`]).toBeUndefined();
  });

  it('requires a materializable billing schedule for configured fees', () => {
    const values = baseValues();
    expect(validateOperationalServiceValues({
      ...values,
      startDate: '',
      fees: [{ ...values.fees[0], billingStartDate: '' }],
    }).feeLines).toBeTruthy();
    expect(validateOperationalServiceValues({
      ...values,
      fees: [{ ...values.fees[0], scheduleConfig: { ...values.fees[0].scheduleConfig!, scheduleEntries: [] } }],
    }).feeLines).toBeTruthy();
  });

  it('lets custom billing schedules choose a non-default month interval', () => {
    const values = {
      ...baseValues(),
      fees: [{
        ...baseValues().fees[0],
        billingFrequency: 'CUSTOM' as const,
        customFrequencyLabel: 'Every 18 months',
        scheduleConfig: {
          schemaVersion: 1 as const,
          cadence: 'CUSTOM' as const,
          startDate: '2026-08-01' as const,
          customInterval: { unit: 'MONTH' as const, count: 1 },
          scheduleEntries: [{
            key: 'default', label: 'Billing date',
            expression: { kind: 'DAY_OF_MONTH' as const, day: 1 },
            businessDayAdjustment: 'NONE' as const,
          }],
        },
      }],
    };
    render(<Harness initial={values} />);
    const interval = screen.getByLabelText('Fee 1 custom interval months');
    expect(interval).toHaveValue(1);
    fireEvent.change(interval, { target: { value: '18' } });
    expect(interval).toHaveValue(18);
  });

  it('preserves every authored schedule entry when cadence or start date changes', () => {
    const values = baseValues();
    const repeatableValues: OperationalServiceValues = {
      ...values,
      deadlineRules: [{
        uiId: 'rule-test',
        ruleId: 'r-1',
        code: 'TEST_RULE',
        name: 'Test Rule',
        enabled: true,
        parameterValues: {},
        parameterProvenance: {},
        scheduleEntries: [
          {
            key: 'primary',
            label: 'Primary filing date',
            expression: { kind: 'DAY_OF_MONTH' as const, day: 1 },
            businessDayAdjustment: 'NONE' as const,
          },
          {
            key: 'follow-up',
            label: 'Follow-up filing date',
            expression: { kind: 'DAY_OF_MONTH' as const, day: 15 },
            businessDayAdjustment: 'NEXT' as const,
          },
        ],
        parameters: [],
        catalogDerived: true,
      }],
    };
    render(<Harness initial={repeatableValues} />);
    fireEvent.click(screen.getByText('Test Rule'));
    const labels = () => screen.getAllByLabelText('Entry label').map((input) => (input as HTMLInputElement).value);
    const keys = () => screen.getAllByLabelText('Entry label').map((input) => input.id.replace(/^schedule-/, '').replace(/-label$/, ''));

    expect(labels()).toEqual(['Primary filing date', 'Follow-up filing date']);
    expect(keys()).toEqual(['primary', 'follow-up']);
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
    expect(labels()).toEqual(['Primary filing date', 'Follow-up filing date']);
    expect(keys()).toEqual(['primary', 'follow-up']);
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'MONTHLY' } });
    expect(labels()).toEqual(['Primary filing date', 'Follow-up filing date']);
    expect(keys()).toEqual(['primary', 'follow-up']);
    expect(screen.getAllByLabelText('Day of month').map((input) => (input as HTMLInputElement).value)).toEqual(['1', '15']);
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

    expect(screen.getByLabelText('Renewal date')).toBeVisible();
    expect(screen.getByLabelText('Renewal date')).toHaveValue('1 Aug 2026');
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

  it('renders cadence and billing frequency options in proper case', () => {
    render(<Harness initial={baseValues()} />);
    const cadenceSelect = screen.getByLabelText('Cadence');
    const cadenceOptionLabels = Array.from(cadenceSelect.querySelectorAll('option')).map((opt) => opt.textContent);
    expect(cadenceOptionLabels).toEqual([
      'Monthly',
      'Quarterly',
      'Semi-annually',
      'Annually',
      'One-time',
      'Ad-hoc',
      'Custom',
    ]);

    const frequencySelect = screen.getByLabelText('Fee 1 frequency');
    const frequencyOptionLabels = Array.from(frequencySelect.querySelectorAll('option')).map((opt) => opt.textContent);
    expect(frequencyOptionLabels).toEqual([
      'Select frequency',
      'Monthly',
      'Quarterly',
      'Semi-annually',
      'Annually',
      'One-time',
      'Custom',
    ]);
  });

  it('shows tooltip guidance for custom cadence', () => {
    const customValues: OperationalServiceValues = {
      ...baseValues(),
      serviceCadence: 'CUSTOM',
      customCadenceLabel: 'Every 18 months',
    };
    render(<Harness initial={customValues} />);
    expect(screen.getByText('Custom cadence help')).toBeInTheDocument();
  });

  it('shows archive confirmation in edit mode when switching to NOT_REQUIRED with existing fees', () => {
    function EditHarness() {
      const [values, setValues] = useState(baseValues());
      return <OperationalServiceForm mode="edit" values={values} onChange={setValues} errors={{}} />;
    }
    render(<EditHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'No billing required' }));
    expect(screen.getByRole('dialog', { name: 'Hide billing schedules?' })).toBeInTheDocument();
    expect(screen.getByText(/This will archive the active billing schedules/)).toBeInTheDocument();
  });

  it('does not show archive confirmation in create mode when switching to NOT_REQUIRED', () => {
    function CreateHarness() {
      const [values, setValues] = useState(baseValues());
      return <OperationalServiceForm mode="create" values={values} onChange={setValues} errors={{}} />;
    }
    render(<CreateHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'No billing required' }));
    expect(screen.queryByRole('dialog', { name: 'Hide billing schedules?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No billing required' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders rules collapsed by default and expands on click to reveal parameters and schedule', () => {
    const valuesWithRules: OperationalServiceValues = {
      ...baseValues(),
      deadlineRules: [{
        uiId: 'rule-agm',
        ruleId: 'r-1',
        code: 'SG_AGM',
        name: 'Singapore Annual General Meeting',
        enabled: true,
        parameterValues: {},
        parameterProvenance: {},
        scheduleEntries: [{
          key: 'e-1',
          label: 'AGM Milestone',
          expression: { kind: 'DAY_OF_MONTH', day: 30 },
          businessDayAdjustment: 'NONE',
        }],
        parameters: [{
          key: 'meetingType',
          label: 'Meeting type',
          type: 'STRING',
          description: null,
          required: false,
          defaultValue: null,
          validation: null,
          helpText: null,
          displayOrder: 0,
        }],
        catalogDerived: true,
      }],
    };

    render(<Harness initial={valuesWithRules} />);
    expect(screen.getByText('Singapore Annual General Meeting')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Enable Singapore Annual General Meeting' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add custom schedule for Singapore Annual General Meeting' })).toBeVisible();
    expect(screen.queryByLabelText('Meeting type')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Singapore Annual General Meeting'));
    expect(screen.getByLabelText('Meeting type')).toBeVisible();
    expect(screen.getByLabelText('Entry label')).toHaveValue('AGM Milestone');
  });

  it('does not expand rules without parameters or custom schedules until Add custom schedule is clicked', () => {
    const valuesWithSimpleRule: OperationalServiceValues = {
      ...baseValues(),
      deadlineRules: [{
        uiId: 'rule-simple',
        ruleId: 'r-simple',
        code: 'SIMPLE_RULE',
        name: 'Simple Statutory Rule',
        enabled: true,
        parameterValues: {},
        parameterProvenance: {},
        scheduleEntries: [],
        parameters: [],
        catalogDerived: true,
      }],
    };

    render(<Harness initial={valuesWithSimpleRule} />);
    expect(screen.getByRole('heading', { name: 'Simple Statutory Rule' })).toBeVisible();
    expect(screen.queryByLabelText('Entry label')).not.toBeInTheDocument();

    // Clicking header should not expand since there's no custom schedule
    fireEvent.click(screen.getByRole('heading', { name: 'Simple Statutory Rule' }));
    expect(screen.queryByLabelText('Entry label')).not.toBeInTheDocument();

    // Clicking "Add custom schedule" automatically creates entry and expands
    fireEvent.click(screen.getByRole('button', { name: 'Add custom schedule for Simple Statutory Rule' }));
    expect(screen.getByLabelText('Entry label')).toBeVisible();
  });

  it('sources actual deadline preview dates directly from company accountsDueDate regardless of start date year', () => {
    const valuesWithRules: OperationalServiceValues = {
      ...baseValues(),
      startDate: '2020-01-01',
      deadlineRules: [
        {
          uiId: 'rule-ar',
          ruleId: 'r-ar',
          code: 'SG_ANNUAL_RETURN',
          name: 'Singapore Annual Return',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
        {
          uiId: 'rule-agm',
          ruleId: 'r-agm',
          code: 'SG_AGM',
          name: 'Annual General Meeting (AGM)',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
      ],
    };

    function ContextHarness() {
      const [values, setValues] = useState(valuesWithRules);
      return (
        <OperationalServiceForm
          values={values}
          onChange={setValues}
          errors={{}}
          companyContext={{
            id: 'c-1',
            name: 'Acme Pte Ltd',
            accountsDueDate: '2027-07-31',
          }}
        />
      );
    }

    render(<ContextHarness />);
    expect(screen.getByText('Deadlines Preview')).toBeVisible();
    expect(screen.getByText('31 Jul 2027')).toBeVisible();
    expect(screen.getByText('30 Jun 2027')).toBeVisible();
    expect(screen.getByText('Sourced from Company accounts due date (2027-07-31)')).toBeVisible();
    expect(screen.getByText('1 month before Company accounts due date (2027-06-30)')).toBeVisible();
  });

  it('renders overdue statutory backlog in red with distinct alert indicator for past accountsDueDate', () => {
    const valuesWithRules: OperationalServiceValues = {
      ...baseValues(),
      startDate: '2026-01-01',
      deadlineRules: [
        {
          uiId: 'rule-ar-overdue',
          ruleId: 'r-ar',
          code: 'SG_ANNUAL_RETURN',
          name: 'Singapore Annual Return',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
      ],
    };

    function OverdueHarness() {
      const [values, setValues] = useState(valuesWithRules);
      return (
        <OperationalServiceForm
          values={values}
          onChange={setValues}
          errors={{}}
          companyContext={{
            id: 'c-1',
            name: 'Overdue Pte Ltd',
            accountsDueDate: '2024-07-31',
          }}
        />
      );
    }

    render(<OverdueHarness />);
    expect(screen.getByText('31 Jul 2024')).toBeVisible();
    expect(screen.getByText('31 Jul 2025')).toBeVisible();
    expect(screen.getByText('31 Jul 2026')).toBeVisible();
    expect(screen.getByText('31 Jul 2027')).toBeVisible();
    expect(screen.getAllByText('Overdue Backlog').length).toBe(3);
    expect(screen.getByText('Sourced from Company accounts due date (2027-07-31)')).toBeVisible();
  });

  it('populates 12 monthly deadline occurrences across the horizon for monthly service cadence', () => {
    const valuesWithMonthlyRule: OperationalServiceValues = {
      ...baseValues(),
      serviceCadence: 'MONTHLY',
      startDate: '2026-08-01',
      deadlineRules: [
        {
          uiId: 'rule-monthly-gst',
          ruleId: 'r-gst',
          code: 'SG_GST_F5',
          name: 'Monthly GST F5 Filing',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
      ],
    };

    render(<Harness initial={valuesWithMonthlyRule} />);
    expect(screen.getByText('12 scheduled milestones')).toBeVisible();
    expect(screen.getByText('15 Aug 2026')).toBeVisible();
    expect(screen.getByText('15 Jul 2027')).toBeVisible();
    expect(screen.getByText('Month 1 of 12')).toBeVisible();
    expect(screen.getByText('Month 12 of 12')).toBeVisible();
  });

  it('displays actual calculated deadline dates in the preview panel sorted chronologically', () => {
    const valuesWithRules: OperationalServiceValues = {
      ...baseValues(),
      startDate: '2026-08-01',
      deadlineRules: [
        {
          uiId: 'rule-ar',
          ruleId: 'r-ar',
          code: 'SG_ANNUAL_RETURN',
          name: 'Singapore Annual Return',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
        {
          uiId: 'rule-agm',
          ruleId: 'r-agm',
          code: 'SG_AGM',
          name: 'Annual General Meeting (AGM)',
          enabled: true,
          parameterValues: {},
          parameterProvenance: {},
          scheduleEntries: [],
          parameters: [],
          catalogDerived: true,
        },
      ],
    };

    render(<Harness initial={valuesWithRules} />);
    expect(screen.getByText('Deadlines Preview')).toBeVisible();
    expect(screen.getByText('31 Jul 2027')).toBeVisible();
    expect(screen.getByText('30 Jun 2027')).toBeVisible();
    expect(screen.getByText('7 months after FYE (31 Dec 2026)')).toBeVisible();
    expect(screen.getByText('6 months after FYE (31 Dec 2026)')).toBeVisible();
  });

  it('renders a billing preview panel with calculated billing dates and amounts', () => {
    const valuesWithFees: OperationalServiceValues = {
      ...baseValues(),
      deadlineRules: [],
      startDate: '2026-08-01',
      fees: [
        {
          uiId: 'fee-1',
          id: 'f-1',
          description: 'Corporate Secretarial Annual Fee',
          amount: '1200.00',
          currency: 'SGD',
          billingFrequency: 'ANNUALLY',
          customFrequencyLabel: '',
          billingStartDate: '2026-08-01',
          scheduleConfig: null,
          catalogDerived: true,
        },
      ],
    };

    render(<Harness initial={valuesWithFees} />);
    expect(screen.getByText('Billing Preview')).toBeVisible();
    expect(screen.getAllByText('Corporate Secretarial Annual Fee')[0]).toBeVisible();
    expect(screen.getAllByText('1 Aug 2026')[0]).toBeVisible();
    expect(screen.getByText(/Annual billing \(Year 1\) · SGD 1200.00/)).toBeVisible();
  });

  it('generates 12 monthly occurrences in billing preview for monthly fees', () => {
    const valuesWithMonthlyFee: OperationalServiceValues = {
      ...baseValues(),
      deadlineRules: [],
      startDate: '2026-08-01',
      fees: [
        {
          uiId: 'fee-monthly',
          id: 'f-m',
          description: 'Monthly Bookkeeping',
          amount: '500.00',
          currency: 'SGD',
          billingFrequency: 'MONTHLY',
          customFrequencyLabel: '',
          billingStartDate: '2026-08-01',
          scheduleConfig: null,
          catalogDerived: true,
        },
      ],
    };

    render(<Harness initial={valuesWithMonthlyFee} />);
    expect(screen.getByText('12 billing items')).toBeVisible();
    expect(screen.getByText('Month 1 of 12 · SGD 500.00')).toBeVisible();
    expect(screen.getByText('Month 12 of 12 · SGD 500.00')).toBeVisible();
    expect(screen.getByText('1 Jul 2027')).toBeVisible();
  });
});
