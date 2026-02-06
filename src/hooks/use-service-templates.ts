import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import type { BillingFrequency, DeadlineCategory, ServiceStatus, ServiceType } from '@/generated/prisma';
import type { DeadlineRuleInput } from '@/lib/validations/service';

export interface ServiceTemplateRecord {
  code: string;
  name: string;
  category: DeadlineCategory;
  description: string | null;
  serviceType: ServiceType;
  status?: ServiceStatus | null;
  rate?: number | null;
  currency?: string | null;
  frequency: BillingFrequency;
  autoRenewal: boolean;
  renewalPeriodMonths: number | null;
  startDate?: string | null;
  endDate?: string | null;
  scope?: string | null;
  deadlineRules: DeadlineRuleInput[];
  isSystemOverride: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceTemplatePayload {
  name: string;
  category: DeadlineCategory;
  description?: string | null;
  serviceType: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string | null;
  frequency: BillingFrequency;
  autoRenewal: boolean;
  renewalPeriodMonths?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  scope?: string | null;
  deadlineRules: DeadlineRuleInput[];
}

export interface UpdateServiceTemplatePayload {
  name?: string;
  category?: DeadlineCategory;
  description?: string | null;
  serviceType?: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string | null;
  frequency?: BillingFrequency;
  autoRenewal?: boolean;
  renewalPeriodMonths?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  scope?: string | null;
  deadlineRules?: DeadlineRuleInput[];
}

export const serviceTemplateKeys = {
  all: ['service-templates'] as const,
  list: (tenantId: string) => [...serviceTemplateKeys.all, 'list', tenantId] as const,
  detail: (tenantId: string, code: string) => [...serviceTemplateKeys.all, 'detail', tenantId, code] as const,
};

function buildTenantQueryString(tenantId: string | null): string {
  if (!tenantId) return '';
  const params = new URLSearchParams({ tenantId });
  return `?${params.toString()}`;
}

export function useServiceTemplates(options?: { enabled?: boolean }) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: serviceTemplateKeys.list(activeTenantId ?? 'no-tenant'),
    queryFn: async (): Promise<ServiceTemplateRecord[]> => {
      const response = await fetch(`/api/admin/service-templates${buildTenantQueryString(activeTenantId ?? null)}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch service templates');
      }
      const payload = await response.json() as { templates: ServiceTemplateRecord[] };
      return payload.templates;
    },
    enabled: !!activeTenantId && (options?.enabled ?? true),
  });
}

export function useCreateServiceTemplate() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (payload: CreateServiceTemplatePayload): Promise<ServiceTemplateRecord> => {
      const response = await fetch('/api/admin/service-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          tenantId: activeTenantId,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create service template');
      }
      return response.json();
    },
    onSuccess: (created) => {
      if (activeTenantId) {
        queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.list(activeTenantId) });
      }
      queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.all });
      success(`Template "${created.name}" saved`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

export function useUpdateServiceTemplate() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async ({
      code,
      payload,
      systemOverride = false,
    }: {
      code: string;
      payload: UpdateServiceTemplatePayload;
      systemOverride?: boolean;
    }): Promise<ServiceTemplateRecord> => {
      const response = await fetch(`/api/admin/service-templates/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          tenantId: activeTenantId,
          systemOverride,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update service template');
      }
      return response.json();
    },
    onSuccess: (updated, variables) => {
      if (activeTenantId) {
        queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.list(activeTenantId) });
      }
      queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.all });
      success(
        variables.systemOverride
          ? `System template "${updated.name}" overwritten`
          : `Template "${updated.name}" updated`
      );
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

export function useDeleteServiceTemplate() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (code: string): Promise<void> => {
      const queryString = buildTenantQueryString(activeTenantId ?? null);
      const response = await fetch(`/api/admin/service-templates/${encodeURIComponent(code)}${queryString}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete service template');
      }
    },
    onSuccess: () => {
      if (activeTenantId) {
        queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.list(activeTenantId) });
      }
      queryClient.invalidateQueries({ queryKey: serviceTemplateKeys.all });
      success('Template deleted');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
