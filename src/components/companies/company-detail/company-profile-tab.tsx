'use client';

import type { CompanyWithRelations } from '@/services/company/types';
import { CompanyProfileSections } from './company-profile-sections';

interface CompanyProfileTabProps {
  company: CompanyWithRelations;
  companyId: string;
  can: { updateCompany: boolean; deleteOfficer?: boolean; deleteShareholder?: boolean };
}

export function CompanyProfileTab({ company }: CompanyProfileTabProps) {
  return <CompanyProfileSections company={company} />;
}
