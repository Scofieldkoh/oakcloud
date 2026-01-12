'use client';

import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Contract } from '@/hooks/use-contracts';
import {
  getContractTypeLabel,
  getContractStatusLabel,
  getContractStatusColor,
} from '@/lib/constants/contracts';
import { ServiceRow } from './service-row';

interface ContractCardProps {
  contract: Contract;
  isExpanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEditContract: () => void;
  onDeleteContract: () => void;
  onAddService: () => void;
  onEditService: (service: Contract['services'][0]) => void;
  onDeleteService: (service: Contract['services'][0]) => void;
  onViewScope: (service: Contract['services'][0]) => void;
}

export function ContractCard({
  contract,
  isExpanded,
  onToggle,
  canEdit,
  onEditContract,
  onDeleteContract,
  onAddService,
  onEditService,
  onDeleteService,
  onViewScope,
}: ContractCardProps) {
  const statusColor = getContractStatusColor(contract.status);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-background-primary">
      {/* Contract Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-background-secondary transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button className="text-text-muted hover:text-text-primary transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
          <FileText className="w-5 h-5 text-text-muted flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-text-primary truncate">
                {contract.title}
              </h3>
              <span className={`badge ${statusColor}`}>
                {getContractStatusLabel(contract.status)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-muted mt-0.5">
              <span>{getContractTypeLabel(contract.contractType)}</span>
              <span>&bull;</span>
              <span>Started {formatDate(contract.startDate)}</span>
              {contract.services.length > 0 && (
                <>
                  <span>&bull;</span>
                  <span>
                    {contract.services.length} service
                    {contract.services.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onAddService}
              className="p-1.5 rounded text-text-muted hover:text-oak-light hover:bg-background-secondary transition-colors"
              title="Add service"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onEditContract}
              className="p-1.5 rounded text-text-muted hover:text-oak-light hover:bg-background-secondary transition-colors"
              title="Edit contract"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDeleteContract}
              className="p-1.5 rounded text-text-muted hover:text-status-error hover:bg-background-secondary transition-colors"
              title="Delete contract"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Document Attachment (if any) */}
      {contract.document && (
        <div className="px-4 pb-2 ml-8">
          <a
            href={`/api/companies/${contract.companyId}/documents/${contract.document.id}/download`}
            className="inline-flex items-center gap-1.5 text-sm text-oak-light hover:text-oak-dark transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="w-4 h-4" />
            <span className="truncate max-w-[200px]">
              {contract.document.originalFileName}
            </span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Expanded Services Section */}
      {isExpanded && (
        <div className="ml-8 mr-4 mb-3">
          {/* Services Header */}
          <div className="flex items-center py-2">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Services</span>
          </div>

          {/* Services List */}
          {contract.services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4">
              <p className="text-sm text-text-muted mb-3">No services added yet</p>
              {canEdit && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddService();
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Service
                </Button>
              )}
            </div>
          ) : (
            <div className="border border-border-primary rounded-lg divide-y divide-border-primary overflow-hidden">
              {contract.services.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  canEdit={canEdit}
                  onEdit={() => onEditService(service)}
                  onDelete={() => onDeleteService(service)}
                  onViewScope={() => onViewScope(service)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
