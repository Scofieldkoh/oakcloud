/**
 * Contract & Service Constants
 *
 * Constants for contract types, statuses, service types, and billing frequencies.
 */

export const CONTRACT_TYPES = [
  { value: 'ENGAGEMENT_LETTER', label: 'Engagement Letter' },
  { value: 'SERVICE_AGREEMENT', label: 'Service Agreement' },
  { value: 'RETAINER_CONTRACT', label: 'Retainer Contract' },
  { value: 'NDA', label: 'Non-Disclosure Agreement' },
  { value: 'VENDOR_AGREEMENT', label: 'Vendor Agreement' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const CONTRACT_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'badge-neutral' },
  { value: 'ACTIVE', label: 'Active', color: 'badge-success' },
  { value: 'TERMINATED', label: 'Terminated', color: 'badge-error' },
] as const;

export const SERVICE_TYPES = [
  { value: 'RECURRING', label: 'Recurring' },
  { value: 'ONE_TIME', label: 'One-time' },
] as const;

export const SERVICE_STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'badge-success' },
  { value: 'COMPLETED', label: 'Completed', color: 'badge-neutral' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'badge-error' },
  { value: 'PENDING', label: 'Pending', color: 'badge-warning' },
] as const;

export const BILLING_FREQUENCIES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-Annually' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One-time' },
] as const;

// Helper functions to get labels and colors
export const getContractTypeLabel = (value: string) =>
  CONTRACT_TYPES.find((t) => t.value === value)?.label ?? value;

export const getContractStatusLabel = (value: string) =>
  CONTRACT_STATUSES.find((s) => s.value === value)?.label ?? value;

export const getContractStatusColor = (value: string) =>
  CONTRACT_STATUSES.find((s) => s.value === value)?.color ?? 'badge-neutral';

export const getServiceTypeLabel = (value: string) =>
  SERVICE_TYPES.find((t) => t.value === value)?.label ?? value;

export const getServiceStatusLabel = (value: string) =>
  SERVICE_STATUSES.find((s) => s.value === value)?.label ?? value;

export const getServiceStatusColor = (value: string) =>
  SERVICE_STATUSES.find((s) => s.value === value)?.color ?? 'badge-neutral';

export const getBillingFrequencyLabel = (value: string) =>
  BILLING_FREQUENCIES.find((f) => f.value === value)?.label ?? value;

// Type exports
export type ContractTypeValue = (typeof CONTRACT_TYPES)[number]['value'];
export type ContractStatusValue = (typeof CONTRACT_STATUSES)[number]['value'];
export type ServiceTypeValue = (typeof SERVICE_TYPES)[number]['value'];
export type ServiceStatusValue = (typeof SERVICE_STATUSES)[number]['value'];
export type BillingFrequencyValue = (typeof BILLING_FREQUENCIES)[number]['value'];
