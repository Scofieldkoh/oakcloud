'use client';

import { useMemo } from 'react';
import type { Company, DocumentContact, DocumentPartyOption } from '@/types/document-generation';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type { MasterFieldCatalogue } from '@/types/document-generation-batch';
import { normalizePlaceholderKey } from '@/lib/template-analysis';
import { canonicalPlaceholderType, masterFieldId } from '@/lib/document-generation-master-fields';
import type { EditableBatchItem } from './batch-workspace-state';
import { StandardDocumentConfig } from './standard-document-config';
import { ServiceAgreementConfig } from './service-agreement-config';

export interface BatchItemConfiguratorProps {
  item: EditableBatchItem;
  primaryCompany: Company | null;
  companies: Company[];
  contacts: DocumentContact[];
  companyContacts: DocumentContact[];
  directors: DocumentPartyOption[];
  shareholders: DocumentPartyOption[];
  partyLoading?: boolean;
  partyError?: string | null;
  onPartyRetry?: () => void;
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  templateFields?: CustomPlaceholderDefinition[];
  onPatch: (patch: Partial<EditableBatchItem['configuration']>) => void;
  disabled?: boolean;
}

export function BatchItemConfigurator(props: BatchItemConfiguratorProps) {
  const {
    item,
    masterFields,
    effectiveMasterValues,
    onPatch,
    disabled,
    templateFields = [],
    companyContacts,
  } = props;
  const itemOnlyFields = useMemo(() => {
    const masterIds = new Set(masterFields.fields.map((field) => field.id));
    return templateFields.filter((field) => {
      const id = masterFieldId(
        normalizePlaceholderKey(field.key),
        canonicalPlaceholderType(field.type),
      );
      return !masterIds.has(id);
    });
  }, [templateFields, masterFields.fields]);
  if (item.status === 'GENERATED') {
    return (
      <div className="rounded-lg border border-border-primary bg-background-secondary p-4 text-sm text-text-secondary">
        This document is generated and read-only inside the batch.
      </div>
    );
  }
  return item.templateKind === 'SERVICE_AGREEMENT'
    ? (
      <ServiceAgreementConfig
        item={item}
        primaryCompany={props.primaryCompany}
        companies={props.companies}
        contacts={companyContacts}
        masterFields={masterFields}
        effectiveMasterValues={effectiveMasterValues}
        templateFields={itemOnlyFields}
        onPatch={onPatch}
        disabled={disabled}
      />
    )
    : (
      <StandardDocumentConfig
        item={item}
        templateFields={itemOnlyFields}
        masterFields={masterFields}
        effectiveMasterValues={effectiveMasterValues}
        directors={props.directors}
        shareholders={props.shareholders}
        contacts={props.contacts}
        companyContacts={companyContacts}
        partyLoading={props.partyLoading}
        partyError={props.partyError}
        onPartyRetry={props.onPartyRetry}
        onPatch={onPatch}
        disabled={disabled}
      />
    );
}
