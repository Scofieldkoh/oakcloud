'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Contact, ContactType, IdentificationType } from '@prisma/client';
import type { CreateContactInput, UpdateContactInput } from '@/lib/validations/contact';

interface ContactWithCount extends Contact {
  _count?: {
    companyRelations: number;
  };
}

interface ContactWithRelationships extends Contact {
  companyRelations: Array<{
    id: string;
    relationship: string;
    isPrimary: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
      status: string;
      deletedAt: string | null;
    };
  }>;
  officerPositions: Array<{
    id: string;
    role: string;
    designation: string | null;
    appointmentDate: string | null;
    cessationDate: string | null;
    isCurrent: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
    };
  }>;
  shareholdings: Array<{
    id: string;
    shareClass: string;
    numberOfShares: number;
    percentageHeld: number | null;
    isCurrent: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
    };
  }>;
}

interface ContactSearchParams {
  query?: string;
  contactType?: ContactType;
  companyId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'fullName' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  tenantId?: string;
}

interface ContactSearchResult {
  contacts: ContactWithCount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function fetchContacts(params: ContactSearchParams): Promise<ContactSearchResult> {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(`/api/contacts?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch contacts');
  }
  return response.json();
}

async function fetchContact(id: string, full = true): Promise<ContactWithRelationships> {
  const response = await fetch(`/api/contacts/${id}?full=${full}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch contact');
  }
  return response.json();
}

async function createContact(data: CreateContactInput & { tenantId?: string }): Promise<Contact> {
  const response = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create contact');
  }
  return response.json();
}

async function updateContact(id: string, data: Partial<UpdateContactInput>): Promise<Contact> {
  const response = await fetch(`/api/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update contact');
  }
  return response.json();
}

async function deleteContact(id: string, reason: string): Promise<{ message: string; contact: Contact }> {
  const response = await fetch(`/api/contacts/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete contact');
  }
  return response.json();
}

async function restoreContact(id: string): Promise<{ message: string; contact: Contact }> {
  const response = await fetch(`/api/contacts/${id}?action=restore`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to restore contact');
  }
  return response.json();
}

async function linkContactToCompany(
  contactId: string,
  companyId: string,
  relationship: string,
  isPrimary = false
): Promise<{ message: string }> {
  const response = await fetch(`/api/contacts/${contactId}?action=link-company`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, relationship, isPrimary }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to link contact to company');
  }
  return response.json();
}

async function unlinkContactFromCompany(
  contactId: string,
  companyId: string,
  relationship: string
): Promise<{ message: string }> {
  const response = await fetch(`/api/contacts/${contactId}?action=unlink-company`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, relationship }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to unlink contact from company');
  }
  return response.json();
}

export function useContacts(params: ContactSearchParams = {}) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => fetchContacts(params),
  });
}

export function useContact(id: string, full = true) {
  return useQuery({
    queryKey: ['contact', id, full],
    queryFn: () => fetchContact(id, full),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactInput & { tenantId?: string }) => createContact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateContactInput> }) =>
      updateContact(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteContact(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useRestoreContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => restoreContact(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', id] });
    },
  });
}

/**
 * Bulk delete multiple contacts
 */
async function bulkDeleteContacts(ids: string[], reason: string): Promise<{ deleted: number; message: string }> {
  const response = await fetch('/api/contacts/bulk', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, reason }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to delete contacts');
  }

  return response.json();
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      bulkDeleteContacts(ids, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useLinkContactToCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contactId,
      companyId,
      relationship,
      isPrimary,
    }: {
      contactId: string;
      companyId: string;
      relationship: string;
      isPrimary?: boolean;
    }) => linkContactToCompany(contactId, companyId, relationship, isPrimary),
    onSuccess: (_, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUnlinkContactFromCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contactId,
      companyId,
      relationship,
    }: {
      contactId: string;
      companyId: string;
      relationship: string;
    }) => unlinkContactFromCompany(contactId, companyId, relationship),
    onSuccess: (_, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// Type exports for convenience
export type { ContactWithCount, ContactWithRelationships, ContactSearchParams, ContactSearchResult };
