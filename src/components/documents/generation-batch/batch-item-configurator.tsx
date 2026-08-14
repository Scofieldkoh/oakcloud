'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Company, DocumentContact, DocumentPartyOption } from '@/types/document-generation';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type {
  BatchItemConfiguration,
  MasterFieldCatalogue,
} from '@/types/document-generation-batch';
import type { EditableBatchItem } from './batch-workspace-state';
import { StandardDocumentConfig } from './standard-document-config';
import { ServiceAgreementConfig } from './service-agreement-config';
import { partitionTemplateFields, type ItemCompleteness } from './batch-completeness';
import type { ApplyScope } from './apply-to-others-menu';

export interface BatchItemConfiguratorProps {
  item: EditableBatchItem;
  primaryCompany: Company | null;
  companies: Company[];
  contacts: DocumentContact[];
  contactsById?: Map<string, DocumentContact>;
  companyContacts: DocumentContact[];
  directors: DocumentPartyOption[];
  shareholders: DocumentPartyOption[];
  partyLoading?: boolean;
  partyError?: string | null;
  onPartyRetry?: () => void;
  onContactSearch?: (query: string) => void;
  contactsLoading?: boolean;
  masterFields: MasterFieldCatalogue;
  effectiveMasterValues: Record<string, string>;
  templateFields?: CustomPlaceholderDefinition[];
  onPatch: (patch: Partial<BatchItemConfiguration>) => void;
  disabled?: boolean;
  completeness?: ItemCompleteness;
  otherItemCount?: number;
  otherIncompleteCount?: number;
  onApplyToOthers?: (scope: ApplyScope, patch: Partial<BatchItemConfiguration>) => void;
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

  const itemOnlyFields = useMemo(
    () => partitionTemplateFields(templateFields, masterFields).itemOnly,
    [templateFields, masterFields],
  );

  if (item.status === 'GENERATED') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border-primary bg-background-secondary p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-text-primary">Generated and locked</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            This document has been generated, so its configuration is read-only
            inside the batch. Open the generated document to make further edits.
          </p>
        </div>
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
        completeness={props.completeness}
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
        contactsById={props.contactsById}
        companyContacts={companyContacts}
        partyLoading={props.partyLoading}
        partyError={props.partyError}
        onPartyRetry={props.onPartyRetry}
        onContactSearch={props.onContactSearch}
        contactsLoading={props.contactsLoading}
        onPatch={onPatch}
        disabled={disabled}
        completeness={props.completeness}
        otherItemCount={props.otherItemCount}
        otherIncompleteCount={props.otherIncompleteCount}
        onApplyToOthers={props.onApplyToOthers}
      />
    );
}
