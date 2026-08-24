import type { BillingFrequency, ClientServiceSource, ClientServiceStatus, ServiceAgreementActivationStatus, ServiceAgreementStatus, ServiceCadence } from '@/generated/prisma';
import type { ClientServiceDeadlineRuleInput } from '@/lib/validations/client-service';
import type { ScheduleEntryInput } from '@/lib/validations/service-schedule';
import type { BillingScheduleConfigV1 } from '@/services/billing/types';

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
  family: { id: string; name: string; displayColor: string };
  serviceCadence: ServiceCadence;
  customCadenceLabel: string | null;
  fields: ManualClientServiceCatalogField[];
  feeTemplates: ManualClientServiceCatalogFeeTemplate[];
  deadlineRules: ManualClientServiceCatalogDeadlineRule[];
}

export interface ManualClientServiceCatalogParameterDefinition {
  key: string;
  label: string;
  description: string | null;
  type: 'DATE' | 'INTEGER' | 'DECIMAL' | 'STRING' | 'BOOLEAN' | 'ENUM';
  required: boolean;
  defaultValue: unknown;
  validation: unknown;
  helpText: string | null;
  displayOrder: number;
}

export interface ManualClientServiceCatalogDeadlineRule {
  ruleId: string;
  code: string;
  name: string;
  enabledByDefault: boolean;
  parameterDefaults: Record<string, unknown>;
  scheduleDefaults: ScheduleEntryInput[];
  parameters: ManualClientServiceCatalogParameterDefinition[];
  currentVersionId: string;
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
  scheduleConfig: BillingScheduleConfigV1 | null;
  displayOrder: number;
}

export interface ClientServiceDeadlineRuleDto extends Omit<ClientServiceDeadlineRuleInput, 'parameterValues'> {
  id: string;
  parameterValues: Record<string, unknown>;
  lastEvaluatedVersionId: string | null;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'MISSING_INPUT';
  applicabilityReason: string | null;
  configHash: string | null;
  updatedAt: string;
  rule: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    archivedAt: string | null;
    currentVersionId: string | null;
    currentVersion: {
      id: string;
      version: number;
      configHash: string;
      recurrence: unknown;
      applicability: unknown;
      parameters: ManualClientServiceCatalogParameterDefinition[];
    } | null;
  } | null;
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
  billingDisposition: 'CONFIGURED' | 'NOT_REQUIRED' | 'UNREVIEWED';
  billingNotRequiredReason: string | null;
  fieldValues: Record<string, string>;
  feeLines: ClientServiceFeeLineDto[];
  deadlineRules: ClientServiceDeadlineRuleDto[];
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
