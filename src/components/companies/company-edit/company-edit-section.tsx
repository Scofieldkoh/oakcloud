'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { CompanyAccentSection } from '@/components/companies/company-accent-section';
import { Button } from '@/components/ui/button';
import type { CompanyProfileSectionId } from '@/lib/company-profile-sections';
import type { CompanyProfileSectionDto } from '@/services/company/profile-sections';
import {
  CompanyProfileConflictError,
  useCompanyProfileSection,
  useSaveCompanyProfileSection,
} from '@/hooks/use-company-profile-sections';

const objectDefaults: Record<string, Record<string, unknown>> = {
  registered: { block: '', streetName: '', level: '', unit: '', buildingName: '', postalCode: '', country: 'Singapore', effectiveFrom: null },
  mailing: { block: '', streetName: '', level: '', unit: '', buildingName: '', postalCode: '', country: 'Singapore' },
  primary: { code: '', description: '' },
  secondary: { code: '', description: '' },
  auditor: { name: '', address: '', appointmentDate: null },
};

const arrayDefaults: Record<string, Record<string, unknown>> = {
  officers: { name: '', role: 'DIRECTOR', identificationType: null, identificationNumber: '', nationality: '', address: '', appointmentDate: null, cessationDate: null, isCurrent: true },
  shareholders: { name: '', shareholderType: 'INDIVIDUAL', identificationType: null, identificationNumber: '', nationality: '', placeOfOrigin: '', address: '', shareClass: 'ORDINARY', numberOfShares: 0, percentageHeld: null, currency: 'SGD', isCurrent: true },
  shareCapital: { shareClass: 'ORDINARY', currency: 'SGD', numberOfShares: 0, parValue: null, totalValue: 0, isPaidUp: true, isTreasury: false },
  charges: { chargeNumber: '', chargeType: '', description: '', chargeHolderName: '', amountSecured: null, amountSecuredText: '', currency: 'SGD', registrationDate: null, dischargeDate: null, isFullyDischarged: false },
  formerNames: { formerName: '', effectiveFrom: '', effectiveTo: null },
};

function words(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

function fieldLabel(path: string[]): string {
  const meaningful = path.filter((part) => !/^\d+$/.test(part));
  const last = meaningful.at(-1) ?? 'value';
  const parent = meaningful.at(-2);
  const prefix = parent === 'registered' || parent === 'mailing' ? `${words(parent)} ` : '';
  const label = `${prefix}${words(last)}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isDateField(key: string): boolean {
  return /date|effectiveFrom|effectiveTo|fyeAsAtLastAr/i.test(key);
}

export function CompanyProfileValueEditor({ value, path, onChange }: { value: unknown; path: string[]; onChange: (value: unknown) => void }) {
  const key = path.at(-1) ?? '';
  const label = fieldLabel(path);
  if (Array.isArray(value)) {
    return <div className="space-y-3 sm:col-span-2">
      <div className="flex items-center justify-between"><p className="label mb-0">{label}</p><Button size="xs" variant="secondary" onClick={() => onChange([...value, { ...(arrayDefaults[key] ?? {}) }])} leftIcon={<Plus />}>Add {words(key).replace(/s$/, '')}</Button></div>
      {value.map((item, index) => <div key={index} className="rounded-lg border border-border-primary bg-background-primary p-3">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-text-secondary">{label} {index + 1}</p><Button size="xs" variant="ghost" iconOnly aria-label={`Remove ${label} ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} leftIcon={<Trash2 />} /></div>
        <CompanyProfileValueEditor value={item} path={[...path, String(index)]} onChange={(next) => onChange(value.map((entry, itemIndex) => itemIndex === index ? next : entry))} />
      </div>)}
    </div>;
  }
  if (value && typeof value === 'object') {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">{Object.entries(value as Record<string, unknown>).filter(([child]) => child !== 'id').map(([child, childValue]) => <CompanyProfileValueEditor key={child} value={childValue} path={[...path, child]} onChange={(next) => onChange({ ...(value as Record<string, unknown>), [child]: next })} />)}</div>;
  }
  if (value === null && objectDefaults[key]) {
    return <div><p className="label">{label}</p><Button variant="secondary" size="xs" onClick={() => onChange({ ...objectDefaults[key] })}>Add {words(key)}</Button></div>;
  }
  if (typeof value === 'boolean') {
    return <label className="flex items-center gap-2 text-sm text-text-primary"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  }
  const numeric = typeof value === 'number';
  return <label className="block text-sm"><span className="label">{label}</span><input aria-label={label} className="input input-sm w-full" type={numeric ? 'number' : isDateField(key) ? 'date' : 'text'} step={numeric ? 'any' : undefined} value={value == null ? '' : String(value)} onChange={(event) => onChange(numeric ? (event.target.value === '' ? null : Number(event.target.value)) : (event.target.value || (isDateField(key) ? null : '')))} /></label>;
}

export interface CompanyEditSectionProps {
  companyId: string;
  section: CompanyProfileSectionId;
  title: string;
  initialData?: CompanyProfileSectionDto;
  onSave?: (section: CompanyProfileSectionId, data: unknown, version: string) => Promise<CompanyProfileSectionDto>;
}

export function CompanyEditSection({ companyId, section, title, initialData, onSave }: CompanyEditSectionProps) {
  const query = useCompanyProfileSection(companyId, section, initialData);
  const mutation = useSaveCompanyProfileSection(companyId, section);
  const [draft, setDraft] = useState<unknown>(initialData?.data);
  const [version, setVersion] = useState(initialData?.version ?? '');
  const [baseline, setBaseline] = useState<unknown>(initialData?.data);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<CompanyProfileSectionDto | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDraft(query.data.data);
    setBaseline(query.data.data);
    setVersion(query.data.version);
  }, [query.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const save = async () => {
    if (!dirty) return;
    setError(null);
    setLatest(null);
    try {
      const saved = onSave
        ? await onSave(section, draft, version)
        : await mutation.mutateAsync({ data: draft, ifMatchVersion: version });
      setDraft(saved.data);
      setBaseline(saved.data);
      setVersion(saved.version);
    } catch (caught) {
      const conflictLatest = caught instanceof CompanyProfileConflictError
        ? caught.latest
        : caught && typeof caught === 'object' && 'latest' in caught
          ? (caught as { latest: CompanyProfileSectionDto }).latest
          : null;
      if (conflictLatest) setLatest(conflictLatest);
      setError(caught instanceof Error ? caught.message : 'Failed to save section');
    }
  };

  if (query.isLoading || draft === undefined) return <div className="card p-4 text-sm text-text-secondary">Loading {title}…</div>;
  return <CompanyAccentSection title={title} actions={<div className="flex items-center gap-2"><Button size="xs" variant="secondary" disabled={!dirty} onClick={() => { setDraft(baseline); setError(null); setLatest(null); }}>Cancel</Button><Button size="xs" onClick={save} isLoading={mutation.isPending} disabled={!dirty} aria-label={`Save ${title}`}>Save section</Button></div>}>
    {error ? <div className="border-b border-status-error/30 bg-status-error/5 px-4 py-3 text-sm text-status-error"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</div>{latest ? <Button className="mt-2" size="xs" variant="secondary" onClick={() => { setDraft(latest.data); setBaseline(latest.data); setVersion(latest.version); setLatest(null); setError(null); }}>Reload latest section</Button> : null}</div> : null}
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2"><CompanyProfileValueEditor value={draft} path={[section]} onChange={setDraft} /></div>
  </CompanyAccentSection>;
}
