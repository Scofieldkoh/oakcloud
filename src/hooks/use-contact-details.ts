import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import type { ContactDetailType } from '@/generated/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface ContactDetail {
  id: string;
  tenantId: string;
  contactId: string | null;
  companyId: string | null;
  detailType: ContactDetailType;
  value: string;
  label: string | null;
  purposes: string[];
  description: string | null;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    fullName: string;
    contactType: string;
    email: string | null;
    phone: string | null;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
}

export interface ContactWithDetails {
  contact: {
    id: string;
    fullName: string;
    contactType: string;
    email: string | null;
    phone: string | null;
    relationship?: string;
  };
  details: ContactDetail[];
}

export interface CompanyContactDetailsResponse {
  companyDetails: ContactDetail[];
  contactDetails: ContactWithDetails[];
}

export interface CreateContactDetailInput {
  detailType: ContactDetailType;
  value: string;
  label?: string;
  purposes?: string[];
  description?: string;
  displayOrder?: number;
  isPrimary?: boolean;
  contactId?: string;
}

export interface UpdateContactDetailInput {
  detailType?: ContactDetailType;
  value?: string;
  label?: string | null;
  purposes?: string[];
  description?: string | null;
  displayOrder?: number;
  isPrimary?: boolean;
}

export interface CreateContactWithDetailsInput {
  relationship: string;
  contact: {
    contactType: 'INDIVIDUAL' | 'CORPORATE';
    firstName?: string;
    lastName?: string;
    corporateName?: string;
    corporateUen?: string;
    identificationType?: 'NRIC' | 'FIN' | 'PASSPORT' | 'UEN' | 'OTHER';
    identificationNumber?: string;
    nationality?: string;
    email?: string;
    phone?: string;
    fullAddress?: string;
  };
  contactDetails?: Array<{
    detailType: ContactDetailType;
    value: string;
    label?: string;
    purposes?: string[];
    description?: string;
    isPrimary?: boolean;
  }>;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const contactDetailKeys = {
  all: ['contact-details'] as const,
  company: (companyId: string) => [...contactDetailKeys.all, 'company', companyId] as const,
  detail: (companyId: string, detailId: string) => [...contactDetailKeys.company(companyId), detailId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get all contact details for a company (including linked contacts' details)
 */
export function useCompanyContactDetails(companyId: string | null) {
  return useQuery({
    queryKey: contactDetailKeys.company(companyId ?? ''),
    queryFn: async (): Promise<CompanyContactDetailsResponse> => {
      const response = await fetch(`/api/companies/${companyId}/contact-details`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch contact details');
      }
      return response.json();
    },
    enabled: !!companyId,
  });
}

/**
 * Create a new company-level contact detail
 */
export function useCreateContactDetail(companyId: string) {
  const queryClient = useQueryClient();
  const { error } = useToast();

  return useMutation({
    mutationFn: async (data: CreateContactDetailInput) => {
      const response = await fetch(`/api/companies/${companyId}/contact-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create contact detail');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactDetailKeys.company(companyId) });
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Update a contact detail
 */
export function useUpdateContactDetail(companyId: string) {
  const queryClient = useQueryClient();
  const { error } = useToast();

  return useMutation({
    mutationFn: async ({ detailId, data }: { detailId: string; data: UpdateContactDetailInput }) => {
      const response = await fetch(`/api/companies/${companyId}/contact-details/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update contact detail');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactDetailKeys.company(companyId) });
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Delete a contact detail
 */
export function useDeleteContactDetail(companyId: string) {
  const queryClient = useQueryClient();
  const { error } = useToast();

  return useMutation({
    mutationFn: async (detailId: string) => {
      const response = await fetch(`/api/companies/${companyId}/contact-details/${detailId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete contact detail');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactDetailKeys.company(companyId) });
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Create a new contact with details and link to company
 */
export function useCreateContactWithDetails(companyId: string) {
  const queryClient = useQueryClient();
  const { error } = useToast();

  return useMutation({
    mutationFn: async (data: CreateContactWithDetailsInput) => {
      const response = await fetch(`/api/companies/${companyId}/contact-details/create-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactDetailKeys.company(companyId) });
      // Also invalidate company query to refresh linked contacts
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Export contact details for selected companies
 */
export function useExportContactDetails() {
  const { error } = useToast();

  return useMutation({
    mutationFn: async (companyIds: string[]) => {
      const response = await fetch('/api/companies/export-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to export contact details');
      }

      // Get filename from response headers
      const disposition = response.headers.get('Content-Disposition');
      let filename = 'contact-details.xlsx';
      if (disposition) {
        const matches = disposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true };
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
