'use client';

import { Pencil, Trash2, Eye, RotateCcw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Contract } from '@/hooks/use-contracts';
import {
  getServiceTypeLabel,
  getServiceStatusLabel,
  getServiceStatusColor,
} from '@/lib/constants/contracts';

interface ServiceRowProps {
  service: Contract['services'][0];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewScope: () => void;
}

export function ServiceRow({
  service,
  canEdit,
  onEdit,
  onDelete,
  onViewScope,
}: ServiceRowProps) {
  const statusColor = getServiceStatusColor(service.status);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRate = (rate: number | null, currency: string, frequency: string) => {
    if (rate === null) return null;
    const formattedRate = new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(rate);

    if (service.serviceType === 'ONE_TIME') {
      return formattedRate;
    }

    // Add frequency suffix for recurring
    const frequencySuffix: Record<string, string> = {
      MONTHLY: '/mo',
      QUARTERLY: '/qtr',
      SEMI_ANNUALLY: '/6mo',
      ANNUALLY: '/yr',
      ONE_TIME: '',
    };

    return `${formattedRate}${frequencySuffix[frequency] || ''}`;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-background-secondary transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-text-primary truncate">
            {service.name}
          </span>
          <span className={`badge ${service.serviceType === 'RECURRING' ? 'badge-info' : 'badge-neutral'}`}>
            {getServiceTypeLabel(service.serviceType)}
          </span>
          <span className={`badge ${statusColor}`}>
            {getServiceStatusLabel(service.status)}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted flex-wrap">
          {/* Rate */}
          {service.rate !== null && (
            <span className="font-medium text-text-primary">
              {formatRate(Number(service.rate), service.currency, service.frequency)}
            </span>
          )}

          {/* Date range */}
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(service.startDate)}
            {service.endDate ? (
              <>
                <span>-</span>
                {formatDate(service.endDate)}
              </>
            ) : (
              <span className="text-text-muted"> - ongoing</span>
            )}
          </span>

          {/* Auto renewal indicator */}
          {service.autoRenewal && (
            <span className="flex items-center gap-1 text-oak-light">
              <RotateCcw className="w-3.5 h-3.5" />
              Auto-renews
              {service.renewalPeriodMonths && (
                <span>({service.renewalPeriodMonths} months)</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-4">
        {service.scope && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onViewScope}
            aria-label="View scope of work"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="ml-1 hidden sm:inline">Scope</span>
          </Button>
        )}

        {canEdit && (
          <>
            <button
              onClick={onEdit}
              className="p-1.5 rounded text-text-muted hover:text-oak-light hover:bg-background-elevated transition-colors"
              title="Edit service"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded text-text-muted hover:text-status-error hover:bg-background-elevated transition-colors"
              title="Delete service"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
