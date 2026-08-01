import type { BillingFrequency, ClientServiceStatus, ServiceAgreementActivationStatus, ServiceAgreementStatus, ServiceCadence } from '@/generated/prisma';

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
  agreementId: string;
  agreementItemId: string;
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
  agreement: {
    title: string;
    status: ServiceAgreementStatus;
    activationStatus: ServiceAgreementActivationStatus;
    generatedDocumentId: string;
    href: string;
  };
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
