import type { BillingFrequency, ClientServiceStatus, ServiceCadence } from '@/generated/prisma';
import type { ClientServiceDto, ManualClientServiceCatalogField, ManualClientServiceCatalogVariantOption } from '@/services/client-service';

export interface OperationalFieldRow {
  uiId: string;
  key: string;
  label: string;
  type: ManualClientServiceCatalogField['type'];
  value: string;
  catalogDerived: boolean;
}

export interface OperationalFeeRow {
  uiId: string;
  id?: string;
  description: string;
  amount: string;
  currency: string;
  billingFrequency: BillingFrequency | '';
  customFrequencyLabel: string;
  billingStartDate: string;
  catalogDerived: boolean;
}

export interface OperationalServiceValues {
  status: ClientServiceStatus;
  serviceCadence: ServiceCadence;
  customCadenceLabel: string;
  startDate: string;
  endDate: string;
  fields: OperationalFieldRow[];
  fees: OperationalFeeRow[];
}

export type OperationalFieldErrors = Record<string, string | undefined>;

export function validateOperationalServiceValues(values: OperationalServiceValues): OperationalFieldErrors {
  const errors: OperationalFieldErrors = {};
  if (!values.startDate) errors.startDate = 'Start date is required.';
  if (values.serviceCadence === 'CUSTOM' && !values.customCadenceLabel.trim()) {
    errors.customCadenceLabel = 'Custom cadence is required.';
  }
  if (values.endDate && values.startDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after start date.';
  }
  for (const [index, fee] of values.fees.entries()) {
    const prefix = `fee-${fee.uiId}`;
    if (!fee.description.trim()) errors[`${prefix}-description`] = `Fee ${index + 1} description is required.`;
    if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(fee.amount)) errors[`${prefix}-amount`] = `Fee ${index + 1} amount is invalid.`;
    if (!/^[A-Z]{3}$/.test(fee.currency.trim().toUpperCase())) errors[`${prefix}-currency`] = `Fee ${index + 1} currency must be a three-letter code.`;
    if (!fee.billingFrequency) errors[`${prefix}-frequency`] = `Fee ${index + 1} frequency is required.`;
    if (fee.billingFrequency === 'CUSTOM' && !fee.customFrequencyLabel.trim()) {
      errors[`${prefix}-custom-frequency`] = `Fee ${index + 1} custom frequency is required.`;
    }
  }
  return errors;
}

export function operationalErrorsFromServer(
  details: unknown,
  values: OperationalServiceValues,
): OperationalFieldErrors {
  if (!details || typeof details !== 'object' || !('fieldErrors' in details)) return {};
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return {};

  const translated: OperationalFieldErrors = {};
  const feeSuffix: Record<string, string> = {
    description: 'description',
    amount: 'amount',
    currency: 'currency',
    billingFrequency: 'frequency',
    customFrequencyLabel: 'custom-frequency',
    billingStartDate: 'billing-start-date',
  };

  for (const [path, message] of Object.entries(fieldErrors)) {
    if (typeof message !== 'string') continue;
    const feeMatch = /^feeLines\.(\d+)\.([A-Za-z]+)$/.exec(path);
    if (feeMatch) {
      const fee = values.fees[Number(feeMatch[1])];
      const suffix = feeSuffix[feeMatch[2]];
      if (fee && suffix) translated[`fee-${fee.uiId}-${suffix}`] = message;
      else translated.feeLines = message;
      continue;
    }

    const fieldMatch = /^fieldValues\.([^.]*)$/.exec(path);
    if (fieldMatch) {
      const field = values.fields.find((row) => row.key === fieldMatch[1]);
      translated[field ? `field-${field.uiId}-value` : 'fieldValues'] = message;
      continue;
    }

    translated[path || 'body'] = message;
  }
  return translated;
}

export function operationalFieldValues(values: OperationalServiceValues): Record<string, string> {
  return Object.fromEntries(
    values.fields
      .filter((field) => field.key.trim())
      .map((field) => [field.key.trim(), field.value]),
  );
}

export function manualCreateFeeLines(values: OperationalServiceValues) {
  return values.fees.map((fee) => {
    if (!fee.billingFrequency) throw new Error('Fee frequency is required');
    return {
      description: fee.description,
      amount: fee.amount,
      currency: fee.currency.trim().toUpperCase(),
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.billingFrequency === 'CUSTOM' ? fee.customFrequencyLabel : null,
      billingStartDate: fee.billingStartDate || null,
    };
  });
}

export function updateFeeLines(values: OperationalServiceValues) {
  return values.fees.map((fee, displayOrder) => {
    if (!fee.billingFrequency) throw new Error('Fee frequency is required');
    return {
      ...(fee.id ? { id: fee.id } : {}),
      description: fee.description,
      amount: fee.amount,
      currency: fee.currency.trim().toUpperCase(),
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.billingFrequency === 'CUSTOM' ? fee.customFrequencyLabel : null,
      billingStartDate: fee.billingStartDate || null,
      displayOrder,
    };
  });
}

export function valuesFromClientService(service: ClientServiceDto): OperationalServiceValues {
  return {
    status: service.status,
    serviceCadence: service.serviceCadence,
    customCadenceLabel: service.customCadenceLabel ?? '',
    startDate: service.startDate,
    endDate: service.endDate ?? '',
    fields: Object.entries(service.fieldValues).map(([key, value]) => ({
      uiId: crypto.randomUUID(),
      key,
      label: key,
      type: 'text' as const,
      value,
      catalogDerived: false,
    })),
    fees: service.feeLines.map((fee) => ({
      uiId: crypto.randomUUID(),
      id: fee.id,
      description: fee.description,
      amount: fee.amount,
      currency: fee.currency,
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.customFrequencyLabel ?? '',
      billingStartDate: fee.billingStartDate ?? '',
      catalogDerived: false,
    })),
  };
}

export function emptyManualOperationalValues(): OperationalServiceValues {
  return {
    status: 'ACTIVE',
    serviceCadence: 'MONTHLY',
    customCadenceLabel: '',
    startDate: '',
    endDate: '',
    fields: [],
    fees: [],
  };
}

export function catalogReplacementForVariant(variant: ManualClientServiceCatalogVariantOption): OperationalServiceValues {
  return {
    status: 'ACTIVE',
    serviceCadence: variant.serviceCadence,
    customCadenceLabel: variant.customCadenceLabel ?? '',
    startDate: '',
    endDate: '',
    fields: variant.fields.map((field) => ({
      uiId: crypto.randomUUID(),
      key: field.key,
      label: field.label,
      type: field.type,
      value: field.defaultValue ?? '',
      catalogDerived: true,
    })),
    fees: variant.feeTemplates.length > 0
      ? variant.feeTemplates.map((fee) => ({
        uiId: crypto.randomUUID(),
        description: fee.description,
        amount: fee.defaultAmount ?? '',
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel ?? '',
        billingStartDate: '',
        catalogDerived: true,
      }))
      : [{
        uiId: crypto.randomUUID(),
        description: variant.name,
        amount: '',
        currency: 'SGD',
        billingFrequency: '',
        customFrequencyLabel: '',
        billingStartDate: '',
        catalogDerived: true,
      }],
  };
}

function operationalSignature(values: OperationalServiceValues): string {
  return JSON.stringify({
    serviceCadence: values.serviceCadence,
    customCadenceLabel: values.customCadenceLabel,
    fields: values.fields.map(({ key, label, type, value }) => ({ key, label, type, value })),
    fees: values.fees.map(({ description, amount, currency, billingFrequency, customFrequencyLabel, billingStartDate }) => ({
      description,
      amount,
      currency,
      billingFrequency,
      customFrequencyLabel,
      billingStartDate,
    })),
  });
}

export function replacementValuesChanged(values: OperationalServiceValues, replacement: OperationalServiceValues): boolean {
  return operationalSignature(values) !== operationalSignature(replacement);
}

export function createManualPayload(variantId: string, values: OperationalServiceValues, confirmDuplicate: boolean) {
  return {
    serviceVariantId: variantId,
    status: values.status,
    serviceCadence: values.serviceCadence,
    customCadenceLabel: values.serviceCadence === 'CUSTOM' ? values.customCadenceLabel : null,
    startDate: values.startDate,
    endDate: values.endDate || null,
    fieldValues: operationalFieldValues(values),
    feeLines: manualCreateFeeLines(values),
    confirmDuplicate,
  };
}

function manualDirtySignature(values: OperationalServiceValues): string {
  return JSON.stringify({
    status: values.status,
    serviceCadence: values.serviceCadence,
    customCadenceLabel: values.customCadenceLabel,
    startDate: values.startDate,
    endDate: values.endDate,
    fields: values.fields.map(({ key, label, type, value, catalogDerived }) => ({ key, label, type, value, catalogDerived })),
    fees: values.fees.map((fee) => ({
      description: fee.description,
      amount: fee.amount,
      currency: fee.currency,
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.customFrequencyLabel,
      billingStartDate: fee.billingStartDate,
      catalogDerived: fee.catalogDerived,
    })),
  });
}

export function manualFormIsDirty(
  selectedVariantId: string | null,
  values: OperationalServiceValues,
): boolean {
  return Boolean(selectedVariantId)
    || manualDirtySignature(values) !== manualDirtySignature(emptyManualOperationalValues());
}
