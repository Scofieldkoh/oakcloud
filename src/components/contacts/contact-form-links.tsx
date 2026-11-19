'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Paperclip, Link2, Unlink } from 'lucide-react';
import { CompanyAccentButton, CompanyAccentSection } from '@/components/companies/company-accent-section';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  ContactFormLinkApiError,
  useAcceptFormSuggestion,
  useContactFormLinks,
  useDismissFormSuggestion,
  useFormLinkCandidates,
  useLinkFormPerson,
  useUnlinkFormPerson,
} from '@/hooks/use-contact-form-links';
import { formatDateOnlyDisplay } from '@/lib/date-only';
import { formatDate } from '@/lib/utils';
import type { ContactFormLinkDto, ContactFormLinkSuggestionDto } from '@/types/contact-form-link';

interface ContactFormLinksSectionProps {
  contactId: string;
  /** contact:update. Reading needs contact:read and document:read: the parent only mounts this section for those. */
  canEdit: boolean;
}

const STALE_MESSAGE = 'This changed since you opened it. Refresh.';

function displayValue(field: string, value: string | null): string {
  if (value === null || value === '') return 'Not set';
  return field === 'dateOfBirth' ? formatDateOnlyDisplay(value) : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof ContactFormLinkApiError && error.status === 409 && error.reason === 'STALE_SUGGESTION') return STALE_MESSAGE;
  return error instanceof Error ? error.message : 'The request failed';
}

function StateBadge({ link }: { link: ContactFormLinkDto }) {
  if (link.state === 'ACTIVE') return <span className="badge badge-success">Linked</span>;
  if (link.state === 'RESPONSE_DELETED') return <span className="badge badge-neutral">Response deleted</span>;
  return <span className="badge badge-warning">Response changed</span>;
}

export function ContactFormLinksSection({ contactId, canEdit }: ContactFormLinksSectionProps) {
  const { success } = useToast();
  const { data: links, isLoading, error } = useContactFormLinks(contactId);
  const accept = useAcceptFormSuggestion(contactId);
  const dismiss = useDismissFormSuggestion(contactId);
  const unlink = useUnlinkFormPerson(contactId);
  const [showLink, setShowLink] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<ContactFormLinkDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Without document:read the API refuses the whole section: show nothing, not even a title.
  if (error instanceof ContactFormLinkApiError && error.status === 403) return null;

  const onAccept = async (link: ContactFormLinkDto, suggestion: ContactFormLinkSuggestionDto) => {
    setNotice(null);
    try {
      await accept.mutateAsync({ linkId: link.id, field: suggestion.field, expectedCurrentValue: suggestion.current, proposedValue: suggestion.proposed });
      success(`${suggestion.label} updated`);
    } catch (failure) {
      setNotice(errorMessage(failure));
    }
  };
  const onDismiss = async (link: ContactFormLinkDto, suggestion: ContactFormLinkSuggestionDto) => {
    setNotice(null);
    try {
      await dismiss.mutateAsync({ linkId: link.id, field: suggestion.field, proposedValue: suggestion.proposed });
    } catch (failure) {
      setNotice(errorMessage(failure));
    }
  };
  const onUnlink = async () => {
    if (!unlinkTarget) return;
    try {
      await unlink.mutateAsync(unlinkTarget.id);
      success('Form response unlinked');
    } catch (failure) {
      setNotice(errorMessage(failure));
    } finally {
      setUnlinkTarget(null);
    }
  };

  return (
    <CompanyAccentSection
      title="KYC/CDD forms"
      actions={canEdit ? (
        <CompanyAccentButton onClick={() => setShowLink(true)}>
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Link form
        </CompanyAccentButton>
      ) : undefined}
    >
      <div className="divide-y divide-border-primary">
        <p role="status" aria-live="polite" className={notice ? 'px-4 py-2 text-sm text-status-error' : 'sr-only'}>
          {notice}
        </p>
        {isLoading && <p className="px-4 py-3 text-sm text-text-secondary">Loading linked forms…</p>}
        {error && !isLoading && <p className="px-4 py-3 text-sm text-status-error">{errorMessage(error)}</p>}
        {!isLoading && !error && links?.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-secondary">No KYC/CDD form response is linked to this contact.</p>
        )}
        {links?.map((link) => (
          <div key={link.id} className="space-y-3 px-4 py-3" data-testid={`form-link-${link.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                  <span className="truncate">{link.formTitle}</span>
                  <StateBadge link={link} />
                </div>
                <p className="text-xs text-text-secondary">
                  {link.personName ? `${link.personName} · ` : ''}
                  {link.personRowIndex === null ? 'Whole response' : `Person ${link.personRowIndex + 1}`}
                  {link.submittedAt ? ` · submitted ${formatDate(link.submittedAt)}` : ''}
                </p>
              </div>
              {canEdit && (
                <button type="button" className="btn-ghost btn-xs" onClick={() => setUnlinkTarget(link)} disabled={unlink.isPending}>
                  <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  Unlink
                </button>
              )}
            </div>

            {link.state === 'ROW_CHANGED' && (
              <p className="text-sm text-text-secondary">This form response changed; unlink and link again.</p>
            )}
            {link.state === 'RESPONSE_DELETED' && (
              <p className="text-sm text-text-secondary">Form response deleted. You can still unlink it.</p>
            )}

            {link.state === 'ACTIVE' && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {link.responseUrl && (
                    <Link href={link.responseUrl} className="inline-flex items-center gap-1 text-oak-light hover:text-oak-dark">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Open response
                    </Link>
                  )}
                  {link.pdfUrl && (
                    <a href={link.pdfUrl} className="inline-flex items-center gap-1 text-oak-light hover:text-oak-dark">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Response PDF (all people on the form)
                    </a>
                  )}
                </div>
                {link.attachments.length > 0 && (
                  <ul className="space-y-1 text-sm" aria-label="Attachments">
                    {link.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex flex-wrap items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                        <a href={attachment.url} className="text-oak-light hover:text-oak-dark">{attachment.fileName}</a>
                        <span className="text-xs text-text-secondary">
                          {attachment.fieldLabel}{attachment.scope === 'response' ? ' (whole response)' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {link.readOnlyAnswers.length > 0 && (
                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    {link.readOnlyAnswers.map((row) => (
                      <div key={row.label}>
                        <dt className="text-xs text-text-secondary">{row.label}</dt>
                        <dd className="text-text-primary">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {link.suggestions.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Suggested updates">
                      <thead>
                        <tr className="text-left text-xs text-text-secondary">
                          <th className="py-1 pr-3 font-medium">Field</th>
                          <th className="py-1 pr-3 font-medium">On the contact</th>
                          <th className="py-1 pr-3 font-medium">On the form</th>
                          <th className="py-1 font-medium"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {link.suggestions.map((suggestion) => (
                          <tr key={suggestion.field} className="border-t border-border-primary align-top">
                            <td className="py-2 pr-3">{suggestion.label}</td>
                            <td className="py-2 pr-3 text-text-secondary">{displayValue(suggestion.field, suggestion.current)}</td>
                            <td className="py-2 pr-3">
                              {displayValue(suggestion.field, suggestion.proposed)}
                              {suggestion.reason && <p className="text-xs text-status-error">{suggestion.reason}</p>}
                            </td>
                            <td className="py-2">
                              {canEdit && (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    className="btn-secondary btn-xs"
                                    disabled={!suggestion.canApply || accept.isPending}
                                    aria-label={`Accept ${suggestion.label}`}
                                    onClick={() => onAccept(link, suggestion)}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ghost btn-xs"
                                    disabled={dismiss.isPending}
                                    aria-label={`Dismiss ${suggestion.label}`}
                                    onClick={() => onDismiss(link, suggestion)}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <LinkFormModal contactId={contactId} isOpen={showLink} onClose={() => setShowLink(false)} />
      <ConfirmDialog
        isOpen={unlinkTarget !== null}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={onUnlink}
        title="Unlink form response"
        description="The contact keeps everything already accepted. Suggestions and the form's files stop showing here."
        confirmLabel="Unlink"
        variant="danger"
        isLoading={unlink.isPending}
      />
    </CompanyAccentSection>
  );
}

function LinkFormModal({ contactId, isOpen, onClose }: { contactId: string; isOpen: boolean; onClose: () => void }) {
  const { success } = useToast();
  const [formId, setFormId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [rowKey, setRowKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const link = useLinkFormPerson(contactId);

  const forms = useFormLinkCandidates(contactId, {}, isOpen);
  const submissions = useFormLinkCandidates(contactId, { formId }, isOpen && formId !== '');
  const persons = useFormLinkCandidates(contactId, { formId, submissionId }, isOpen && formId !== '' && submissionId !== '');

  const reset = () => {
    setFormId('');
    setSubmissionId('');
    setRowKey(null);
    setFailure(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (rowKey === null) return;
    setFailure(null);
    try {
      await link.mutateAsync({ formId, submissionId, personRowIndex: rowKey === 'whole' ? null : Number(rowKey) });
      success('Form response linked');
      close();
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Link a KYC/CDD form response" size="lg">
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label htmlFor="form-link-form" className="label">Form</label>
            <select
              id="form-link-form"
              className="input w-full"
              value={formId}
              onChange={(event) => { setFormId(event.target.value); setSubmissionId(''); setRowKey(null); }}
            >
              <option value="">Select a form (tagged cdd or kyc)</option>
              {forms.data?.forms?.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
            </select>
            {forms.data?.forms?.length === 0 && <p className="mt-1 text-xs text-text-secondary">No form is tagged cdd or kyc.</p>}
          </div>
          {formId !== '' && (
            <div>
              <label htmlFor="form-link-response" className="label">Response</label>
              <select
                id="form-link-response"
                className="input w-full"
                value={submissionId}
                onChange={(event) => { setSubmissionId(event.target.value); setRowKey(null); }}
              >
                <option value="">Select a response</option>
                {submissions.data?.submissions?.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {formatDate(submission.submittedAt)} · {submission.respondentName || 'No respondent name'} · {submission.personCount} {submission.personCount === 1 ? 'person' : 'people'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {submissionId !== '' && (
            <fieldset>
              <legend className="label">Person</legend>
              <div className="space-y-1">
                {persons.data?.persons?.map((person) => {
                  const key = person.rowIndex === null ? 'whole' : String(person.rowIndex);
                  return (
                    <label key={key} className={`flex items-start gap-2 text-sm ${person.eligible ? '' : 'text-text-tertiary'}`}>
                      <input
                        type="radio"
                        name="form-link-person"
                        disabled={!person.eligible}
                        checked={rowKey === key}
                        onChange={() => setRowKey(key)}
                      />
                      <span>
                        {person.rowIndex === null ? 'Whole response' : `Person ${person.rowNumber}`}: {person.name}
                        <span className="ml-2 text-xs text-text-secondary">{person.kind === 'organisation' ? 'Company' : 'Individual'}</span>
                        {person.reason && <span className="ml-2 text-xs">{person.reason}</span>}
                      </span>
                    </label>
                  );
                })}
                {persons.data?.persons?.length === 0 && <p className="text-xs text-text-secondary">No person with a name or ID on this response.</p>}
              </div>
            </fieldset>
          )}
          {failure && <p role="alert" className="text-sm text-status-error">{failure}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn-secondary btn-sm" onClick={close}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={rowKey === null || link.isPending}>
          Link
        </button>
      </ModalFooter>
    </Modal>
  );
}
