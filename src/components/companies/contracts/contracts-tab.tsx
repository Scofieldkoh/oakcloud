'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, FileText, ScrollText, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import {
  useCompanyContracts,
  useCreateContract,
  useUpdateContract,
  useDeleteContract,
  contractKeys,
  type Contract,
  type CreateContractInput,
  type UpdateContractInput,
} from '@/hooks/use-contracts';
import { serviceKeys } from '@/hooks/use-contract-services';
import { ContractCard } from './contract-card';
import { ContractModal } from './contract-modal';
import { ScopeModal } from './scope-modal';

interface ContractsTabProps {
  companyId: string;
  canEdit: boolean;
}

export function ContractsTab({ companyId, canEdit }: ContractsTabProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  const { data, isLoading, error } = useCompanyContracts(companyId);

  // Contract mutations
  const createContractMutation = useCreateContract(companyId);
  const deleteContractMutation = useDeleteContract(companyId);

  // Track which contract is being edited for the update mutation
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const updateContractMutation = useUpdateContract(companyId, editingContract?.id ?? '');

  // Track service deletion state
  const [isDeletingService, setIsDeletingService] = useState(false);

  // Modal states
  const [showContractModal, setShowContractModal] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState<{
    serviceName: string;
    scope: string;
  } | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'contract' | 'service';
    id: string;
    name: string;
    contractId?: string;
  } | null>(null);

  // Expanded contracts for accordion
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [showTerminated, setShowTerminated] = useState(false);

  const toggleContract = (contractId: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  // Contract handlers
  const handleCreateContract = async (input: CreateContractInput) => {
    try {
      const contract = await createContractMutation.mutateAsync(input);
      setShowContractModal(false);
      // Auto-expand the newly created contract
      setExpandedContracts((prev) => new Set([...prev, contract.id]));
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateContract = async (input: UpdateContractInput) => {
    if (!editingContract) return;
    try {
      await updateContractMutation.mutateAsync(input);
      setEditingContract(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteContract = async (reason?: string) => {
    if (!deleteConfirm || deleteConfirm.type !== 'contract' || !reason?.trim()) return;
    try {
      await deleteContractMutation.mutateAsync({
        contractId: deleteConfirm.id,
        reason: reason.trim(),
      });
      setDeleteConfirm(null);
    } catch {
      // Error handled by mutation
    }
  };

  // Service navigation
  const handleAddService = (contractId: string) => {
    router.push(`/companies/${companyId}/contracts/${contractId}/services/new`);
  };

  const handleEditService = (contractId: string, serviceId: string) => {
    router.push(`/companies/${companyId}/contracts/${contractId}/services/${serviceId}`);
  };

  const handleDeleteService = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'service' || !deleteConfirm.contractId) return;

    const { id: serviceId, contractId } = deleteConfirm;
    setIsDeletingService(true);

    try {
      const url = activeTenantId
        ? `/api/companies/${companyId}/contracts/${contractId}/services/${serviceId}?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/contracts/${contractId}/services/${serviceId}`;

      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete service');
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: contractKeys.detail(companyId, contractId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.contract(contractId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });

      success('Service deleted successfully');
      setDeleteConfirm(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete service');
    } finally {
      setIsDeletingService(false);
    }
  };

  const allContracts = data?.contracts ?? [];

  // Filter contracts based on status
  const contracts = allContracts.filter((contract) => {
    if (!showTerminated && contract.status === 'TERMINATED') return false;
    return true;
  });

  const terminatedCount = allContracts.filter((c) => c.status === 'TERMINATED').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-text-muted">
        {error instanceof Error ? error.message : 'Failed to load contracts'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contracts Card */}
      <div className="card overflow-hidden">
        {/* Card Header */}
        <div className="px-4 py-3 border-b border-border-primary">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-text-primary flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-text-tertiary" />
                Contracts & Services
              </h4>
              <p className="text-xs text-text-secondary mt-1">
                Manage contracts and billable services for this company
              </p>
            </div>
            <div className="flex items-center gap-3">
              {terminatedCount > 0 && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-1.5 rounded transition-colors ${
                    showFilters || showTerminated
                      ? 'bg-oak-light/10 text-oak-light'
                      : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
                  }`}
                  title="Filter contracts"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              )}
              {canEdit && (
                <Button variant="secondary" size="xs" onClick={() => setShowContractModal(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Contract
                </Button>
              )}
              <span className="text-xs text-text-muted">
                {contracts.length} contract{contracts.length !== 1 ? 's' : ''}
                {!showTerminated && terminatedCount > 0 && (
                  <span className="ml-1">({terminatedCount} hidden)</span>
                )}
              </span>
            </div>
          </div>
          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-border-secondary animate-fade-in">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-terminated-contracts"
                    checked={showTerminated}
                    onChange={(e) => setShowTerminated(e.target.checked)}
                    size="sm"
                  />
                  <label htmlFor="show-terminated-contracts" className="text-xs text-text-secondary cursor-pointer">
                    Show terminated
                  </label>
                </div>
                {showTerminated && (
                  <button
                    onClick={() => setShowTerminated(false)}
                    className="btn-ghost btn-xs text-text-muted hover:text-text-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Card Body */}
        {contracts.length === 0 ? (
          <div className="text-center py-6">
            <FileText className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">No contracts yet</p>
            {canEdit && (
              <button
                onClick={() => setShowContractModal(true)}
                className="text-sm text-oak-light hover:text-oak-dark mt-2 inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add first contract
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {contracts.map((contract) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                isExpanded={expandedContracts.has(contract.id)}
                onToggle={() => toggleContract(contract.id)}
                canEdit={canEdit}
                onEditContract={() => setEditingContract(contract)}
                onDeleteContract={() =>
                  setDeleteConfirm({
                    type: 'contract',
                    id: contract.id,
                    name: contract.title,
                  })
                }
                onAddService={() => handleAddService(contract.id)}
                onEditService={(service) => handleEditService(contract.id, service.id)}
                onDeleteService={(service) =>
                  setDeleteConfirm({
                    type: 'service',
                    id: service.id,
                    name: service.name,
                    contractId: contract.id,
                  })
                }
                onViewScope={(service) =>
                  setShowScopeModal({
                    serviceName: service.name,
                    scope: service.scope || '',
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Contract Modal */}
      {(showContractModal || editingContract) && (
        <ContractModal
          isOpen={true}
          onClose={() => {
            setShowContractModal(false);
            setEditingContract(null);
          }}
          contract={editingContract}
          companyId={companyId}
          onSubmit={async (data) => {
            if (editingContract) {
              await handleUpdateContract(data as UpdateContractInput);
            } else {
              await handleCreateContract(data as CreateContractInput);
            }
          }}
          isLoading={createContractMutation.isPending || updateContractMutation.isPending}
        />
      )}

      {/* Scope Modal */}
      {showScopeModal && (
        <ScopeModal
          isOpen={true}
          onClose={() => setShowScopeModal(null)}
          serviceName={showScopeModal.serviceName}
          scope={showScopeModal.scope}
        />
      )}

      {/* Delete Contract Confirmation */}
      {deleteConfirm?.type === 'contract' && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Contract"
          description={`Are you sure you want to delete the contract "${deleteConfirm.name}"? This will also delete all services under this contract.`}
          confirmLabel="Delete Contract"
          variant="danger"
          isLoading={deleteContractMutation.isPending}
          onConfirm={handleDeleteContract}
          requireReason
          reasonLabel="Reason for deletion"
          reasonPlaceholder="Enter reason (min 10 characters)"
          reasonMinLength={10}
        />
      )}

      {/* Delete Service Confirmation */}
      {deleteConfirm?.type === 'service' && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Service"
          description={`Are you sure you want to delete the service "${deleteConfirm.name}"?`}
          confirmLabel="Delete Service"
          variant="danger"
          isLoading={isDeletingService}
          onConfirm={handleDeleteService}
        />
      )}
    </div>
  );
}
