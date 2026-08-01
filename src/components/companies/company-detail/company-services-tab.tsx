'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BriefcaseBusiness, Pencil, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { formatDate } from '@/lib/utils';
import { useClientServices, useRetryServiceAgreementActivation } from '@/hooks/use-client-services';
import type { ClientServiceDto } from '@/services/client-service';
import { ClientServiceEditor } from './client-service-editor';

const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
const currencySymbols: Record<string, string> = { SGD: 'S$', USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', AUD: 'A$', MYR: 'RM' };
function formatFixedCurrency(amount: string, currency: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return `${currency} ${amount}`;
  const integer = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${currencySymbols[currency] ?? `${currency} `}${integer}.${fraction}`;
}

export function CompanyServicesTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED' | 'ENDED' | undefined>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [retryError, setRetryError] = useState('');
  const [editing, setEditing] = useState<ClientServiceDto | null>(null);
  const { data, isLoading, error } = useClientServices(companyId, { query: deferredQuery || undefined, status, page, limit });
  const retryActivation = useRetryServiceAgreementActivation();
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  useEffect(() => { setPage(1); }, [deferredQuery, status]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  if (isLoading) return <div className="space-y-3" aria-label="Loading services"><div className="h-10 skeleton" /><div className="h-24 skeleton" /></div>;
  if (error) return <div className="card flex items-center gap-3 p-4 text-status-error"><AlertCircle className="h-5 w-5" /><span>{error instanceof Error ? error.message : 'Unable to load services'}</span></div>;

  const services = data?.services ?? [];
  const activations = data?.activations ?? [];
  return <div className="space-y-4">
    {retryError ? <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error">{retryError}</div> : null}
    {activations.map((activation) => {
      const failed = activation.activationStatus.startsWith('FAILED');
      return <div key={activation.agreementId} role="alert" className={`flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${failed ? 'border-status-error/30 bg-status-error/5 text-status-error' : 'border-status-warning/30 bg-status-warning/5 text-text-primary'}`}><div><span className="font-medium">{activation.title}</span><span className="ml-2">{failed ? activation.activationLastError ?? 'Activation failed' : 'Service activation is pending.'}</span></div>{failed && canEdit && activation.canRetry ? <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" isLoading={retryActivation.isPending} onClick={async () => { setRetryError(''); try { await retryActivation.mutateAsync({ agreementId: activation.agreementId, companyId }); } catch (retryFailure) { setRetryError(retryFailure instanceof Error ? retryFailure.message : 'Unable to retry activation.'); } }} aria-label="Retry activation">Retry</Button> : null}</div>;
    })}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input aria-label="Search services" className="input w-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services" /></div>
      <div className="flex gap-2" aria-label="Service status filters">{[undefined, 'ACTIVE', 'PAUSED', 'ENDED'].map((value) => <Button className="min-h-11 sm:min-h-8" key={value ?? 'ALL'} size="xs" variant={status === value ? 'primary' : 'secondary'} onClick={() => setStatus(value as typeof status)}>{value ? label(value) : 'All'}</Button>)}</div>
    </div>
    {services.length === 0 ? <div className="card p-6 text-center sm:p-10"><BriefcaseBusiness className="mx-auto mb-3 h-10 w-10 text-text-muted" /><h3 className="font-medium text-text-primary">No services found</h3><p className="mt-1 text-sm text-text-secondary">Services appear here after a Service Agreement is activated.</p></div> : <div className="space-y-3">{services.map((service) => {
      const fee = service.feeLines[0];
      const additionalFeeCount = service.feeLines.length - 1;
      return <article key={service.id} className="card p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-text-primary">{service.serviceName}</h3><span className={`badge ${service.status === 'ACTIVE' ? 'badge-success' : service.status === 'PAUSED' ? 'badge-warning' : 'badge-neutral'}`}>{label(service.status)}</span></div><p className="mt-1 text-sm text-text-secondary">{service.familyName}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted"><span>{label(service.serviceCadence)}</span><span>{formatDate(service.startDate)}{service.endDate ? ` – ${formatDate(service.endDate)}` : ''}</span>{fee ? <span>{formatFixedCurrency(fee.amount, fee.currency)} {label(fee.billingFrequency).toLowerCase()}{additionalFeeCount > 0 ? ` · ${additionalFeeCount} additional fee${additionalFeeCount === 1 ? '' : 's'}` : ''}</span> : null}</div><Link className="mt-2 inline-flex text-sm text-oak-light hover:underline" href={service.agreement.href}>{service.agreement.title || 'Service Agreement'}</Link></div>{canEdit ? <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" leftIcon={<Pencil />} onClick={() => setEditing(service)} aria-label="Edit service">Edit</Button> : null}</div></article>;
    })}</div>}
    {(data?.total ?? 0) > limit ? <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} limit={limit} onPageChange={setPage} onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); }} /> : null}
    {editing ? <ClientServiceEditor key={editing.id} service={editing} isOpen onClose={() => setEditing(null)} /> : null}
  </div>;
}
