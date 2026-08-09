import type { BillingFrequency, ClientServiceSource, ClientServiceStatus, ServiceAgreementActivationStatus, ServiceAgreementStatus, ServiceCadence } from '@/generated/prisma';

export interface AgreementSummary {
  title: string;
  status: ServiceAgreementStatus;
  activationStatus: ServiceAgreementActivationStatus;
  generatedDocumentId: string;
  href: string;
}

export interface DuplicateClientServiceSummary {
  id: string;
  serviceName: string;
  startDate: string;
  status: ClientServiceStatus;
  source: ClientServiceSource;
}

export interface DuplicateClientServiceMatches {
  total: number;
  items: DuplicateClientServiceSummary[];
}

export type ManualClientServiceCatalogFieldType = 'text' | 'date' | 'number' | 'currency' | 'boolean' | 'textarea';

export interface ManualClientServiceCatalogField {
  key: string;
  label: string;
  type: ManualClientServiceCatalogFieldType;
  defaultValue: string | null;
}

export interface ManualClientServiceCatalogFeeTemplate {
  description: string;
  defaultAmount: string | null;
  currency: string;
  billingFrequency: BillingFrequency;
  customFrequencyLabel: string | null;
  displayOrder: number;
}

export interface ManualClientServiceCatalogVariantOption {
  id: string;
  name: string;
  family: { id: string; name: string };
  serviceCadence: ServiceCadence;
  customCadenceLabel: string | null;
  fields: ManualClientServiceCatalogField[];
  feeTemplates: ManualClientServiceCatalogFeeTemplate[];
}

export interface ManualClientServiceCatalogOptionsResponse {
  variants: ManualClientServiceCatalogVariantOption[];
}

export interface ClientServiceFeeLineDto {
  id: string;
  description: string;
  amount: string;
  currency: string;
  billingFrequency: BillingFrequency;
  customFrequencyLabel: string | null;
  billingStartDate: string | null;
  displayOrder: number;
}

export interface ClientServiceDto {
  id: string;
  companyId: string;
  source: ClientServiceSource;
  agreementId: string | null;
  agreementItemId: string | null;
  serviceVariantId: string;
  familyName: string;
  serviceName: string;
  status: ClientServiceStatus;
  serviceCadence: ServiceCadence;
  customCadenceLabel: string | null;
  startDate: string;
  endDate: string | null;
  fieldValues: Record<string, string>;
  feeLines: ClientServiceFeeLineDto[];
  agreement: AgreementSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAgreementActivationDto {
  agreementId: string;
  status: ServiceAgreementStatus;
  activationStatus: ServiceAgreementActivationStatus;
  activationAttemptCount: number;
  activationLastError: string | null;
}

export interface CompanyServiceActivationDto {
  agreementId: string;
  title: string;
  activationStatus: ServiceAgreementActivationStatus;
  activationLastError: string | null;
  canRetry: boolean;
}
