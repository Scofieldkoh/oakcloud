import type {
  BillingFrequency,
  ServiceCadence,
} from '@/lib/validations/service-catalog';

export interface ServiceVariantFeeTemplateDto {
  id: string;
  description: string;
  defaultAmount: string | null;
  currency: string;
  billingFrequency: BillingFrequency;
  customFrequencyLabel: string | null;
  displayOrder: number;
}

export interface ServiceVariantDeadlineRuleDto {
  id: string;
  ruleId: string;
  serviceVariantId: string;
  enabledByDefault: boolean;
  parameterDefaults: Record<string, unknown>;
  scheduleDefaults: unknown[];
  displayOrder: number;
  archivedAt: Date | null;
  rule?: {
    id: string;
    code: string;
    name: string;
    currentVersionId: string | null;
  };
}

export interface ServiceVariantDto {
  id: string;
  familyId: string;
  code: string;
  name: string;
  description: string | null;
  serviceCadence: ServiceCadence;
  customCadenceLabel: string | null;
  displayOrder: number;
  version: number;
  isActive: boolean;
  sowPartial: {
    id: string;
    name: string;
    displayName: string | null;
    version: number;
    placeholders: unknown;
  };
  feeTemplates: ServiceVariantFeeTemplateDto[];
  deadlineRules?: ServiceVariantDeadlineRuleDto[];
}

export interface ServiceFamilyDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string;
  displayOrder: number;
  isActive: boolean;
  variants: ServiceVariantDto[];
}

export interface ServiceCatalogDto {
  families: ServiceFamilyDto[];
  total: number;
}
