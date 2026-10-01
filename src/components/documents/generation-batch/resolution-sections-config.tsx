'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, PenLine, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import { useSession } from '@/hooks/use-auth';
import { useAllTemplatePartials } from '@/hooks/use-template-partials';
import {
  customResolutionParagraphs,
  resolutionCompositionIssues,
  type ResolutionSection,
} from '@/lib/resolution-composition';
import type { ResolutionWorkspaceState } from '@/types/document-generation-batch';
import { createServiceAgreementClientKey as createClientKey } from '@/components/documents/service-agreement/client-key';
import { BatchSection } from './batch-section';

export const EMPTY_RESOLUTION_WORKSPACE: ResolutionWorkspaceState = { subject: '', sections: [] };

/** A partial's default heading: its display name in capitals, like the reference resolution. */
export function defaultResolutionHeading(partial: { name: string; displayName?: string | null }): string {
  return (partial.displayName || partial.name).trim().toUpperCase();
}

export interface ResolutionSectionsConfigProps {
  value: ResolutionWorkspaceState | null | undefined;
  onChange: (next: ResolutionWorkspaceState) => void;
  disabled?: boolean;
}

/**
 * Configure step for RESOLUTION templates: the resolutions to print, each a
 * Word partial or custom text written for this document, numbered in the
 * order listed.
 */
export function ResolutionSectionsConfig({
  value,
  onChange,
  disabled = false,
}: ResolutionSectionsConfigProps) {
  const workspace = value ?? EMPTY_RESOLUTION_WORKSPACE;
  const { data: session } = useSession();
  const tenantId = useActiveWorkspaceId(session?.isSuperAdmin ?? false, session?.tenantId) ?? undefined;
  const partialsQuery = useAllTemplatePartials(tenantId, Boolean(tenantId));
  const wordPartials = useMemo(
    () => (partialsQuery.data?.partials ?? []).filter((partial) => partial.documentEngine === 'OAKDOC'),
    [partialsQuery.data],
  );
  const partialById = useMemo(
    () => new Map(wordPartials.map((partial) => [partial.id, partial])),
    [wordPartials],
  );
  const partialOptions = useMemo(
    () => wordPartials.map((partial) => ({
      value: partial.id,
      label: partial.displayName || partial.name,
      description: partial.description ?? undefined,
    })),
    [wordPartials],
  );
  const [pickedPartialId, setPickedPartialId] = useState('');
  const subjectId = useId();
  const issues = resolutionCompositionIssues(workspace);

  const update = (patch: Partial<ResolutionWorkspaceState>) => onChange({ ...workspace, ...patch });
  const setSections = (sections: ResolutionSection[]) => update({ sections });
  const patchSection = (id: string, patch: Partial<ResolutionSection>) => setSections(
    workspace.sections.map((section) => (
      section.id === id ? { ...section, ...patch } as ResolutionSection : section
    )),
  );
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= workspace.sections.length) return;
    const sections = [...workspace.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setSections(sections);
  };
  const addPartial = (partialId: string) => {
    const partial = partialById.get(partialId);
    if (!partial) return;
    setSections([...workspace.sections, {
      id: createClientKey(),
      kind: 'PARTIAL',
      partialId,
      heading: defaultResolutionHeading(partial),
    }]);
    setPickedPartialId('');
  };
  const addCustom = () => setSections([...workspace.sections, {
    id: createClientKey(),
    kind: 'CUSTOM',
    heading: '',
    body: '',
  }]);

  return (
    <BatchSection
      title="Resolutions"
      description="Numbered 1, 2, 3 in this order when the document is generated."
      status={{
        complete: issues.length === 0,
        label: issues.length === 0
          ? `${workspace.sections.length} resolution${workspace.sections.length === 1 ? '' : 's'}`
          : workspace.sections.length === 0 ? 'At least one resolution required' : `${issues.length} to fix`,
      }}
    >
      <div className="space-y-4">
        <FormInput
          id={`resolution-subject-${subjectId}`}
          label="Subject heading"
          value={workspace.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder="e.g. CHANGE IN COMPANY SECRETARY"
          hint="Printed in bold above the numbered resolutions. Leave empty to omit it."
          disabled={disabled}
          maxLength={300}
          containerClassName="max-w-xl"
        />

        {workspace.sections.length > 0 ? (
          <ol className="space-y-3">
            {workspace.sections.map((section, index) => {
              const partial = section.kind === 'PARTIAL' ? partialById.get(section.partialId) : undefined;
              const headingMissing = !section.heading.trim();
              const bodyMissing = section.kind === 'CUSTOM' && customResolutionParagraphs(section.body).length === 0;
              return (
                <li
                  key={section.id}
                  className="rounded-lg border border-border-primary bg-background-secondary p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{index + 1}.</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-background-tertiary px-2 py-0.5 text-xs text-text-secondary">
                      {section.kind === 'PARTIAL'
                        ? <><FileText className="h-3 w-3" aria-hidden="true" /> Partial: {partial ? (partial.displayName || partial.name) : 'Unavailable'}</>
                        : <><PenLine className="h-3 w-3" aria-hidden="true" /> Custom text</>}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        aria-label={`Move resolution ${index + 1} up`}
                        disabled={disabled || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        aria-label={`Move resolution ${index + 1} down`}
                        disabled={disabled || index === workspace.sections.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        aria-label={`Remove resolution ${index + 1}`}
                        disabled={disabled}
                        onClick={() => setSections(workspace.sections.filter((item) => item.id !== section.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <FormInput
                    id={`resolution-heading-${section.id}`}
                    label="Heading"
                    value={section.heading}
                    onChange={(event) => patchSection(section.id, { heading: event.target.value })}
                    placeholder="e.g. APPOINTMENT OF SECRETARY"
                    error={headingMissing ? 'Required' : undefined}
                    disabled={disabled}
                    maxLength={300}
                    containerClassName="mt-2 max-w-xl"
                  />
                  {section.kind === 'PARTIAL' && !partial && !partialsQuery.isLoading ? (
                    <p className="mt-2 text-xs text-status-error">
                      This partial is no longer available. Remove it or pick another.
                    </p>
                  ) : null}
                  {section.kind === 'CUSTOM' ? (
                    <label className="mt-3 block">
                      <span className="text-sm font-medium text-text-primary">Resolution text</span>
                      <span className="ml-1 text-status-error" aria-hidden="true">*</span>
                      <textarea
                        value={section.body}
                        rows={4}
                        onChange={(event) => patchSection(section.id, { body: event.target.value })}
                        disabled={disabled}
                        maxLength={20000}
                        placeholder="RESOLVED that ..."
                        aria-label={`Resolution ${index + 1} text`}
                        aria-invalid={bodyMissing || undefined}
                        className={cn(
                          'mt-1 w-full rounded-lg border bg-background-primary px-3 py-2 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30',
                          bodyMissing ? 'border-status-error/50' : 'border-border-primary',
                        )}
                      />
                      <span className="mt-1 block text-xs text-text-muted">
                        A blank line starts a new paragraph.
                      </span>
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-text-secondary">
            No resolutions yet. Add a saved partial or write a custom resolution.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <SearchableSelect
              label="Add a partial"
              options={partialOptions}
              value={pickedPartialId}
              onChange={(partialId) => {
                setPickedPartialId(partialId);
                if (partialId) addPartial(partialId);
              }}
              placeholder={partialsQuery.isLoading
                ? 'Loading partials...'
                : wordPartials.length === 0 ? 'No Word partials yet' : 'Search partials...'}
              loading={partialsQuery.isLoading}
              disabled={disabled || wordPartials.length === 0}
              clearable={false}
              size="md"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={addCustom}
            disabled={disabled || workspace.sections.length >= 50}
          >
            Add custom resolution
          </Button>
        </div>
      </div>
    </BatchSection>
  );
}
