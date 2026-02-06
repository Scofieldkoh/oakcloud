'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Filter, X, Pencil, Trash2, Ban, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  useCompanyServices,
  useDeleteCompanyService,
  useUpdateCompanyService,
  type ContractServiceWithRelations,
} from '@/hooks/use-contract-services';
import {
  getServiceStatusColor,
  getServiceStatusLabel,
  getServiceTypeLabel,
  getBillingFrequencyLabel,
} from '@/lib/constants/contracts';
import { formatDateShort, formatCurrency } from '@/lib/utils';
import { ScopeModal } from './scope-modal';

interface ContractsTabProps {
  companyId: string;
  canEdit: boolean;
}

interface ServiceActionTarget {
  id: string;
  name: string;
  endDate: string | null;
}

function canStopService(service: ContractServiceWithRelations): boolean {
  return service.status === 'ACTIVE' || service.status === 'PENDING';
}

function isStoppedService(service: ContractServiceWithRelations): boolean {
  return service.status === 'CANCELLED' || service.status === 'COMPLETED';
}

export function ContractsTab({ companyId, canEdit }: ContractsTabProps) {
  const router = useRouter();
  const { error: toastError } = useToast();

  const { data, isLoading, error } = useCompanyServices(companyId, {
    limit: 200,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });

  const deleteServiceMutation = useDeleteCompanyService(companyId);
  const [stoppingService, setStoppingService] = useState<ServiceActionTarget | null>(null);
  const stopServiceMutation = useUpdateCompanyService(companyId, stoppingService?.id ?? '');

  const [showFilters, setShowFilters] = useState(false);
  const [showStopped, setShowStopped] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ServiceActionTarget | null>(null);
  const [showScopeModal, setShowScopeModal] = useState<{
    serviceName: string;
    scope: string;
  } | null>(null);

  const allServices = data?.services || [];
  const services = allServices.filter((service) => (showStopped ? true : !isStoppedService(service)));
  const stoppedCount = allServices.filter((service) => isStoppedService(service)).length;
  const activeCount = allServices.filter((service) => !isStoppedService(service)).length;

  const handleAddService = () => {
    router.push(`/companies/${companyId}/services/new`);
  };

  const handleEditService = (serviceId: string) => {
    router.push(`/companies/${companyId}/services/${serviceId}`);
  };

  const handleDeleteService = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteServiceMutation.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete service');
    }
  };

  const handleStopService = async () => {
    if (!stoppingService) return;

    const stopDate = new Date().toISOString().split('T')[0];

    try {
      await stopServiceMutation.mutateAsync({
        status: 'CANCELLED',
        endDate: stoppingService.endDate || stopDate,
        autoRenewal: false,
      });
      setStoppingService(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to stop service');
    }
  };

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
        {error instanceof Error ? error.message : 'Failed to load services'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border-primary">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-medium text-text-primary">Services</h4>
              <p className="text-xs text-text-secondary mt-1">
                Add, stop, and remove services. Deadlines are generated from service rules/templates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stoppedCount > 0 && (
                <button
                  onClick={() => setShowFilters((prev) => !prev)}
                  className={`p-1.5 rounded transition-colors ${
                    showFilters || showStopped
                      ? 'bg-oak-light/10 text-oak-light'
                      : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
                  }`}
                  title="Filter services"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              )}
              <Button
                variant="secondary"
                size="xs"
                onClick={() => router.push(`/companies/${companyId}?tab=deadlines`)}
              >
                Deadlines
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
              {canEdit && (
                <Button variant="primary" size="xs" onClick={handleAddService}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Service
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-text-muted">
            {activeCount} active
            {stoppedCount > 0 && <span className="ml-2">{stoppedCount} stopped</span>}
          </div>
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-border-secondary animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-stopped-services"
                    checked={showStopped}
                    onChange={(e) => setShowStopped(e.target.checked)}
                    size="sm"
                  />
                  <label htmlFor="show-stopped-services" className="text-xs text-text-secondary cursor-pointer">
                    Show stopped/completed services
                  </label>
                </div>
                {showStopped && (
                  <button
                    onClick={() => setShowStopped(false)}
                    className="btn-ghost btn-xs text-text-muted hover:text-text-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {services.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted">No services yet</p>
            {canEdit && (
              <button
                onClick={handleAddService}
                className="text-sm text-oak-light hover:text-oak-dark mt-2 inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add first service
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {services.map((service) => (
              <div key={service.id} className="px-4 py-3 hover:bg-background-secondary/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-medium text-text-primary truncate">{service.name}</h5>
                      <span className={`badge ${getServiceStatusColor(service.status)}`}>
                        {getServiceStatusLabel(service.status)}
                      </span>
                      <span className="badge badge-info">
                        {getServiceTypeLabel(service.serviceType)}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {service.contract?.title || 'Services'}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-text-muted">
                      {service.rate != null && (
                        <span className="text-text-primary font-medium">
                          {formatCurrency(Number(service.rate), service.currency)}
                          {service.frequency !== 'ONE_TIME' && (
                            <span className="text-text-muted ml-1">
                              / {getBillingFrequencyLabel(service.frequency).toLowerCase()}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDateShort(service.startDate)}
                        {service.endDate ? ` - ${formatDateShort(service.endDate)}` : ' - ongoing'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {service.scope && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          setShowScopeModal({
                            serviceName: service.name,
                            scope: service.scope || '',
                          })
                        }
                      >
                        Scope
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEditService(service.id)}
                          className="p-1.5 rounded text-text-muted hover:text-oak-light hover:bg-background-elevated transition-colors"
                          title="Edit service"
                          aria-label="Edit service"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canStopService(service) && (
                          <button
                            type="button"
                            onClick={() =>
                              setStoppingService({
                                id: service.id,
                                name: service.name,
                                endDate: service.endDate,
                              })
                            }
                            className="p-1.5 rounded text-text-muted hover:text-status-warning hover:bg-background-elevated transition-colors"
                            title="Stop service"
                            aria-label="Stop service"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteConfirm({
                              id: service.id,
                              name: service.name,
                              endDate: service.endDate,
                            })
                          }
                          className="p-1.5 rounded text-text-muted hover:text-status-error hover:bg-background-elevated transition-colors"
                          title="Delete service"
                          aria-label="Delete service"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showScopeModal && (
        <ScopeModal
          isOpen={true}
          onClose={() => setShowScopeModal(null)}
          serviceName={showScopeModal.serviceName}
          scope={showScopeModal.scope}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Service"
          description={`Are you sure you want to delete the service "${deleteConfirm.name}"?`}
          confirmLabel="Delete Service"
          variant="danger"
          isLoading={deleteServiceMutation.isPending}
          onConfirm={handleDeleteService}
        />
      )}

      {stoppingService && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setStoppingService(null)}
          title="Stop Service"
          description={`Stop "${stoppingService.name}"? This will mark it as cancelled and stop ongoing work tracking.`}
          confirmLabel="Stop Service"
          variant="warning"
          isLoading={stopServiceMutation.isPending}
          onConfirm={handleStopService}
        />
      )}
    </div>
  );
}
