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
}

export interface ServiceFamilyDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  variants: ServiceVariantDto[];
}

export interface ServiceCatalogDto {
  families: ServiceFamilyDto[];
  total: number;
}
