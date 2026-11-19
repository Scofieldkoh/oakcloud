/** Shapes shared by the contact form-link API and the contact page. */

export type ContactFormLinkState = 'ACTIVE' | 'ROW_CHANGED' | 'RESPONSE_DELETED';

export interface ContactFormLinkSuggestionDto {
  field: string;
  label: string;
  current: string | null;
  proposed: string;
  canApply: boolean;
  reason: string | null;
}

export interface ContactFormLinkAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fieldLabel: string;
  scope: 'person' | 'response';
  /** The existing Forms download route (needs document:read). */
  url: string;
}

export interface ContactFormLinkDto {
  id: string;
  state: ContactFormLinkState;
  formId: string;
  formTitle: string;
  submissionId: string;
  submittedAt: string | null;
  personRowIndex: number | null;
  linkedAt: string;
  /** Only while the link is ACTIVE: the person's name on the form, the response page, the PDF and the attachments. */
  personName: string | null;
  responseUrl: string | null;
  pdfUrl: string | null;
  attachments: ContactFormLinkAttachmentDto[];
  suggestions: ContactFormLinkSuggestionDto[];
  readOnlyAnswers: Array<{ label: string; value: string }>;
}

export interface ContactFormCandidateForm {
  id: string;
  title: string;
}

export interface ContactFormCandidateSubmission {
  id: string;
  submittedAt: string;
  respondentName: string | null;
  personCount: number;
}

export interface ContactFormCandidatePerson {
  rowIndex: number | null;
  rowNumber: number;
  kind: 'individual' | 'organisation';
  name: string;
  /** False when it cannot be linked to this contact, with the reason. */
  eligible: boolean;
  reason: string | null;
}

export interface ContactFormCandidates {
  forms?: ContactFormCandidateForm[];
  submissions?: ContactFormCandidateSubmission[];
  persons?: ContactFormCandidatePerson[];
}
