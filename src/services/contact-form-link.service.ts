import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import type { Contact } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '@/lib/errors';
import { updateContact } from '@/services/contact.service';
import { updateContactSchema, type UpdateContactInput } from '@/lib/validations/contact';
import {
  analyseFormFields,
  hasEligibleFormTag,
  personFingerprint,
  personRowCount,
  personUploadRefs,
  readPerson,
  type FormPerson,
  type FormStructure,
} from '@/lib/contact-form-link';
import {
  computeSuggestions,
  readOnlyAnswers,
  suggestionValueHash,
  type ContactSnapshot,
  type Suggestion,
  type SuggestionField,
} from '@/lib/contact-form-mapping';
import type {
  ContactFormCandidates,
  ContactFormLinkAttachmentDto,
  ContactFormLinkDto,
  ContactFormLinkState,
} from '@/types/contact-form-link';

/**
 * Link a KYC/CDD form response person to a Contact, and offer the form's answers back as per-field
 * suggestions. Every query is scoped by tenant. A link binds one repeat row by index AND by a
 * fingerprint; a row that no longer matches hides everything and is never re-bound. Nothing is
 * written to the contact without an explicit accept, which re-checks everything in one transaction.
 */

type Db = typeof prisma | Prisma.TransactionClient;

export interface FormLinkContext {
  tenantId: string;
  userId: string;
}

export type StaleReason = 'STALE_SUGGESTION' | 'ROW_CHANGED' | 'RESPONSE_DELETED' | 'ALREADY_LINKED';

function conflict(message: string, reason: StaleReason): ConflictError {
  return new ConflictError(message, { reason });
}

// --- loading ------------------------------------------------------------------------------------

async function requireContact(db: Db, tenantId: string, contactId: string): Promise<Contact> {
  const contact = await db.contact.findFirst({ where: { id: contactId, tenantId, deletedAt: null } });
  if (!contact) throw new NotFoundError('Contact not found');
  return contact;
}

/** Serialises changes to one contact (links, accepts, dismissals) for the rest of the transaction. */
async function lockContact(tx: Prisma.TransactionClient, tenantId: string, contactId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM contacts WHERE id = ${contactId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError('Contact not found');
}

/**
 * Holds the form and the response in place for the rest of the transaction (a shared row lock): a
 * delete of either must wait for this transaction to finish, or has already been committed and is
 * seen by the reads that follow. Without it a response deleted while an accept is running could
 * still be written from.
 */
async function lockResponse(tx: Prisma.TransactionClient, tenantId: string, formId: string, submissionId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM forms WHERE id = ${formId} AND tenant_id = ${tenantId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM form_submissions WHERE id = ${submissionId} AND form_id = ${formId} AND tenant_id = ${tenantId} FOR SHARE`;
}

async function loadStructures(db: Db, tenantId: string, formIds: string[]): Promise<Map<string, FormStructure>> {
  const result = new Map<string, FormStructure>();
  if (formIds.length === 0) return result;
  const fields = await db.formField.findMany({
    where: { tenantId, formId: { in: formIds } },
    select: { formId: true, key: true, type: true, inputType: true, label: true, position: true },
  });
  for (const formId of formIds) {
    result.set(formId, analyseFormFields(fields.filter((field) => field.formId === formId)));
  }
  return result;
}

function snapshot(contact: Contact): ContactSnapshot {
  return {
    contactType: contact.contactType,
    fullName: contact.fullName,
    identificationType: contact.identificationType,
    identificationNumber: contact.identificationNumber,
    nationality: contact.nationality,
    dateOfBirth: contact.dateOfBirth,
    fullAddress: contact.fullAddress,
    corporateName: contact.corporateName,
    corporateUen: contact.corporateUen,
  };
}

function kindMatchesContact(contact: Pick<Contact, 'contactType'>, kind: FormPerson['kind']): boolean {
  return (contact.contactType === 'CORPORATE') === (kind === 'organisation');
}

interface LoadedLink {
  link: {
    id: string;
    contactId: string;
    formId: string;
    submissionId: string;
    personRowIndex: number | null;
    personFingerprint: string;
    linkedAt: Date;
  };
  form: { id: string; title: string; deletedAt: Date | null };
  submission: { id: string; formId: string; deletedAt: Date | null; answers: unknown; submittedAt: Date };
  structure: FormStructure | undefined;
  state: ContactFormLinkState;
  person: FormPerson | null;
}

/** The state of a link, from the current answers: the row must still be the person that was linked. */
function evaluate(contact: Pick<Contact, 'contactType'>, loaded: Omit<LoadedLink, 'state' | 'person'>): Pick<LoadedLink, 'state' | 'person'> {
  const { form, submission, structure, link } = loaded;
  if (form.deletedAt || submission.deletedAt) return { state: 'RESPONSE_DELETED', person: null };
  if (!structure || submission.formId !== link.formId) return { state: 'ROW_CHANGED', person: null };
  const person = readPerson(submission.answers, structure, link.personRowIndex);
  if (!person || personFingerprint(person) !== link.personFingerprint || !kindMatchesContact(contact, person.kind)) {
    return { state: 'ROW_CHANGED', person: null };
  }
  return { state: 'ACTIVE', person };
}

async function loadLinks(db: Db, tenantId: string, contact: Contact, where: Prisma.ContactFormLinkWhereInput): Promise<LoadedLink[]> {
  const links = await db.contactFormLink.findMany({
    where: { tenantId, contactId: contact.id, unlinkedAt: null, ...where },
    orderBy: { linkedAt: 'desc' },
    include: {
      form: { select: { id: true, title: true, deletedAt: true } },
      submission: { select: { id: true, formId: true, deletedAt: true, answers: true, submittedAt: true } },
    },
  });
  const structures = await loadStructures(db, tenantId, [...new Set(links.map((link) => link.formId))]);
  return links.map((row) => {
    const { form, submission, ...link } = row;
    const base = { link, form, submission, structure: structures.get(link.formId) };
    return { ...base, ...evaluate(contact, base) };
  });
}

// --- suggestions --------------------------------------------------------------------------------

function buildUpdate(contact: Contact, suggestion: Suggestion): { data: UpdateContactInput } | { error: string } {
  const value = suggestion.proposed;
  let fields: Record<string, unknown>;
  switch (suggestion.field) {
    case 'fullName': {
      // The same convention as BizFile imports: the first word is the first name, the rest the last name.
      const [firstName = '', ...rest] = value.trim().split(/\s+/);
      fields = { firstName, lastName: rest.length > 0 ? rest.join(' ') : null };
      break;
    }
    default:
      fields = { [suggestion.field]: value };
  }
  const parsed = updateContactSchema.safeParse({ id: contact.id, ...fields });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'not valid for this field' };
  return { data: parsed.data };
}

/** The suggestions for a person, with every reason one cannot be applied (validation, ID already held). */
async function suggestionsFor(db: Db, tenantId: string, contact: Contact, person: FormPerson): Promise<Suggestion[]> {
  const suggestions = computeSuggestions(snapshot(contact), person);
  for (const suggestion of suggestions) {
    if (!suggestion.canApply) continue;
    const built = buildUpdate(contact, suggestion);
    if ('error' in built) {
      suggestion.canApply = false;
      suggestion.reason = `Can't apply: ${built.error}`;
      continue;
    }
    if (suggestion.field === 'identificationNumber' && contact.identificationType) {
      const holder = await db.contact.findFirst({
        where: {
          tenantId,
          id: { not: contact.id },
          identificationType: contact.identificationType,
          identificationNumber: { equals: suggestion.proposed, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (holder) {
        suggestion.canApply = false;
        suggestion.reason = "Can't apply: another contact already has this ID";
      }
    }
    if (suggestion.field === 'corporateUen') {
      const holder = await db.contact.findFirst({
        where: {
          tenantId,
          id: { not: contact.id },
          deletedAt: null,
          corporateUen: { equals: suggestion.proposed, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (holder) {
        suggestion.canApply = false;
        suggestion.reason = "Can't apply: another contact already has this UEN";
      }
    }
  }
  return suggestions;
}

// --- list ---------------------------------------------------------------------------------------

export async function listContactFormLinks(
  contactId: string,
  ctx: Pick<FormLinkContext, 'tenantId'>,
  options: { linkId?: string } = {},
): Promise<ContactFormLinkDto[]> {
  const contact = await requireContact(prisma, ctx.tenantId, contactId);
  const loaded = await loadLinks(prisma, ctx.tenantId, contact, options.linkId ? { id: options.linkId } : {});
  const active = loaded.filter((entry) => entry.state === 'ACTIVE' && entry.person);

  const dismissals = active.length
    ? await prisma.contactFormSuggestionDismissal.findMany({
        where: { tenantId: ctx.tenantId, linkId: { in: active.map((entry) => entry.link.id) } },
        select: { linkId: true, field: true, valueHash: true },
      })
    : [];
  const dismissed = new Set(dismissals.map((row) => `${row.linkId}:${row.field}:${row.valueHash}`));

  const dtos: ContactFormLinkDto[] = [];
  for (const entry of loaded) {
    const { link, form, submission, structure, state, person } = entry;
    let suggestions: ContactFormLinkDto['suggestions'] = [];
    let attachments: ContactFormLinkAttachmentDto[] = [];
    let readOnly: ContactFormLinkDto['readOnlyAnswers'] = [];
    if (state === 'ACTIVE' && person && structure) {
      suggestions = (await suggestionsFor(prisma, ctx.tenantId, contact, person)).filter(
        (suggestion) => !dismissed.has(`${link.id}:${suggestion.field}:${suggestionValueHash(suggestion.field, suggestion.proposed)}`),
      );
      readOnly = readOnlyAnswers(person);
      const refs = personUploadRefs(submission.answers, structure, link.personRowIndex);
      if (refs.length > 0) {
        // Only uploads that really belong to this response (same tenant, form and submission).
        const uploads = await prisma.formUpload.findMany({
          where: { tenantId: ctx.tenantId, formId: link.formId, submissionId: link.submissionId, id: { in: refs.map((ref) => ref.uploadId) } },
          select: { id: true, fileName: true, originalFileName: true, mimeType: true, sizeBytes: true },
        });
        const byId = new Map(uploads.map((upload) => [upload.id, upload]));
        attachments = refs.flatMap((ref) => {
          const upload = byId.get(ref.uploadId);
          if (!upload) return [];
          return [{
            id: upload.id,
            fileName: upload.originalFileName || upload.fileName,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
            fieldLabel: ref.fieldLabel,
            scope: ref.scope,
            url: `/api/forms/${link.formId}/responses/${link.submissionId}/uploads/${upload.id}`,
          }];
        });
      }
    }
    dtos.push({
      id: link.id,
      state,
      formId: link.formId,
      formTitle: form.title,
      submissionId: link.submissionId,
      submittedAt: submission.submittedAt.toISOString(),
      personRowIndex: link.personRowIndex,
      linkedAt: link.linkedAt.toISOString(),
      personName: state === 'ACTIVE' ? (person?.name ?? null) : null,
      responseUrl: state === 'ACTIVE' ? `/forms/${link.formId}/responses/${link.submissionId}` : null,
      pdfUrl: state === 'ACTIVE' ? `/api/forms/${link.formId}/responses/${link.submissionId}/export/pdf` : null,
      attachments,
      suggestions,
      readOnlyAnswers: readOnly,
    });
  }
  return dtos;
}

// --- candidates ---------------------------------------------------------------------------------

export async function listLinkCandidates(
  contactId: string,
  ctx: Pick<FormLinkContext, 'tenantId'>,
  query: { formId?: string; submissionId?: string },
): Promise<ContactFormCandidates> {
  const contact = await requireContact(prisma, ctx.tenantId, contactId);

  if (!query.formId) {
    const forms = await prisma.form.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, title: true, tags: true },
      orderBy: { title: 'asc' },
    });
    return { forms: forms.filter((form) => hasEligibleFormTag(form.tags)).map(({ id, title }) => ({ id, title })) };
  }

  const form = await prisma.form.findFirst({
    where: { id: query.formId, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, tags: true },
  });
  if (!form) throw new NotFoundError('Form not found');
  if (!hasEligibleFormTag(form.tags)) throw new UnprocessableEntityError('Only forms tagged cdd or kyc can be linked');
  const structure = (await loadStructures(prisma, ctx.tenantId, [form.id])).get(form.id)!;

  if (!query.submissionId) {
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: form.id, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: { id: true, submittedAt: true, respondentName: true, answers: true },
    });
    return {
      submissions: submissions.map((submission) => ({
        id: submission.id,
        submittedAt: submission.submittedAt.toISOString(),
        respondentName: submission.respondentName,
        personCount: personRowCount(submission.answers, structure),
      })),
    };
  }

  const submission = await prisma.formSubmission.findFirst({
    where: { id: query.submissionId, formId: form.id, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, answers: true },
  });
  if (!submission) throw new NotFoundError('Form response not found');
  const taken = await prisma.contactFormLink.findMany({
    where: { tenantId: ctx.tenantId, submissionId: submission.id, unlinkedAt: null },
    select: { personRowIndex: true },
  });
  const takenRows = new Set(taken.map((row) => row.personRowIndex));
  const count = personRowCount(submission.answers, structure);
  const persons: ContactFormCandidates['persons'] = [];
  for (let index = 0; index < count; index += 1) {
    const rowIndex = structure.personMode === 'row' ? index : null;
    const person = readPerson(submission.answers, structure, rowIndex);
    if (!person) continue;
    let reason: string | null = null;
    if (takenRows.has(rowIndex)) reason = 'Already linked to a contact';
    else if (!kindMatchesContact(contact, person.kind)) {
      reason = person.kind === 'organisation' ? 'A company cannot be linked to an individual contact' : 'An individual cannot be linked to a company contact';
    }
    persons.push({
      rowIndex,
      rowNumber: index + 1,
      kind: person.kind,
      name: person.name || person.idNumber,
      fingerprint: personFingerprint(person),
      eligible: reason === null,
      reason,
    });
  }
  return { persons };
}

// --- link / unlink -------------------------------------------------------------------------------

export async function linkContactToFormPerson(
  contactId: string,
  input: { formId: string; submissionId: string; personRowIndex: number | null; expectedFingerprint: string },
  ctx: FormLinkContext,
): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockContact(tx, ctx.tenantId, contactId);
      const contact = await requireContact(tx, ctx.tenantId, contactId);
      await lockResponse(tx, ctx.tenantId, input.formId, input.submissionId);

      const form = await tx.form.findFirst({
        where: { id: input.formId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, tags: true },
      });
      if (!form) throw new NotFoundError('Form not found');
      if (!hasEligibleFormTag(form.tags)) throw new UnprocessableEntityError('Only forms tagged cdd or kyc can be linked');
      const submission = await tx.formSubmission.findFirst({
        where: { id: input.submissionId, formId: form.id, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, answers: true },
      });
      if (!submission) throw new NotFoundError('Form response not found');

      const structure = (await loadStructures(tx, ctx.tenantId, [form.id])).get(form.id)!;
      const person = readPerson(submission.answers, structure, input.personRowIndex);
      if (!person) throw new UnprocessableEntityError('That person is not on the form response');
      // The person the user picked must still be the person at that row: the response may have changed
      // between choosing and saving, and the row must never silently become someone else.
      if (personFingerprint(person) !== input.expectedFingerprint) {
        throw conflict('The form response changed since you chose this person. Choose the person again.', 'ROW_CHANGED');
      }
      if (!kindMatchesContact(contact, person.kind)) {
        throw new UnprocessableEntityError(
          person.kind === 'organisation'
            ? 'A company on a form cannot be linked to an individual contact'
            : 'An individual on a form cannot be linked to a company contact',
        );
      }

      const existing = await tx.contactFormLink.findFirst({
        where: { tenantId: ctx.tenantId, submissionId: submission.id, personRowIndex: input.personRowIndex, unlinkedAt: null },
        select: { id: true },
      });
      if (existing) throw conflict('This person on the form response is already linked to a contact', 'ALREADY_LINKED');

      const link = await tx.contactFormLink.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: contact.id,
          formId: form.id,
          submissionId: submission.id,
          personRowIndex: input.personRowIndex,
          personFingerprint: personFingerprint(person),
          linkedById: ctx.userId,
        },
        select: { id: true },
      });
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'CREATE',
        entityType: 'ContactFormLink',
        entityId: link.id,
        summary: 'Linked a KYC/CDD form response person to a contact',
        changeSource: 'MANUAL',
        metadata: { contactId: contact.id, formId: form.id, submissionId: submission.id, personRowIndex: input.personRowIndex },
      }, tx);
      return link;
    });
  } catch (error) {
    // A concurrent link of the same row loses at the partial unique index.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('This person on the form response is already linked to a contact', 'ALREADY_LINKED');
    }
    throw error;
  }
}

export async function unlinkContactFormLink(contactId: string, linkId: string, ctx: FormLinkContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockContact(tx, ctx.tenantId, contactId);
    const link = await tx.contactFormLink.findFirst({
      where: { id: linkId, contactId, tenantId: ctx.tenantId, unlinkedAt: null },
      select: { id: true, formId: true, submissionId: true, personRowIndex: true },
    });
    if (!link) throw new NotFoundError('Form link not found');
    await tx.contactFormLink.update({ where: { id: link.id }, data: { unlinkedAt: new Date(), unlinkedById: ctx.userId } });
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'DELETE',
      entityType: 'ContactFormLink',
      entityId: link.id,
      summary: 'Unlinked a KYC/CDD form response person from a contact',
      changeSource: 'MANUAL',
      metadata: { contactId, formId: link.formId, submissionId: link.submissionId, personRowIndex: link.personRowIndex },
    }, tx);
  });
}

// --- accept / dismiss ---------------------------------------------------------------------------

/** The active link with the response held (shared lock) before it is read, so a delete cannot slip in after the read. */
async function loadLockedLink(tx: Prisma.TransactionClient, tenantId: string, contact: Contact, linkId: string): Promise<LoadedLink[]> {
  const row = await tx.contactFormLink.findFirst({
    where: { id: linkId, contactId: contact.id, tenantId, unlinkedAt: null },
    select: { formId: true, submissionId: true },
  });
  if (!row) return [];
  await lockResponse(tx, tenantId, row.formId, row.submissionId);
  return loadLinks(tx, tenantId, contact, { id: linkId });
}

interface SuggestionRequest {
  field: SuggestionField;
  /** The contact's value the user saw (null when blank) and the form's value they accepted. */
  expectedCurrentValue: string | null;
  proposedValue: string;
}

/** Re-reads everything inside the transaction and returns the one suggestion the request still matches. */
async function currentSuggestion(
  tx: Prisma.TransactionClient,
  ctx: FormLinkContext,
  contactId: string,
  linkId: string,
  request: SuggestionRequest,
): Promise<{ contact: Contact; link: LoadedLink['link']; suggestion: Suggestion }> {
  const contact = await requireContact(tx, ctx.tenantId, contactId);
  const [loaded] = await loadLockedLink(tx, ctx.tenantId, contact, linkId);
  if (!loaded) throw new NotFoundError('Form link not found');
  if (loaded.state === 'RESPONSE_DELETED') throw conflict('The form response was deleted', 'RESPONSE_DELETED');
  if (loaded.state !== 'ACTIVE' || !loaded.person) {
    throw conflict('This form response changed. Unlink and link the person again.', 'ROW_CHANGED');
  }
  const suggestions = await suggestionsFor(tx, ctx.tenantId, contact, loaded.person);
  const suggestion = suggestions.find((candidate) => candidate.field === request.field);
  if (!suggestion || suggestion.proposed !== request.proposedValue || suggestion.current !== request.expectedCurrentValue) {
    throw conflict('This changed since you opened it. Refresh and try again.', 'STALE_SUGGESTION');
  }
  return { contact, link: loaded.link, suggestion };
}

export async function acceptFormSuggestion(
  contactId: string,
  linkId: string,
  request: SuggestionRequest,
  ctx: FormLinkContext,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockContact(tx, ctx.tenantId, contactId);
      const { contact, link, suggestion } = await currentSuggestion(tx, ctx, contactId, linkId, request);
      if (!suggestion.canApply) throw new UnprocessableEntityError(suggestion.reason ?? "Can't apply this value");
      const built = buildUpdate(contact, suggestion);
      if ('error' in built) throw new UnprocessableEntityError(`Can't apply: ${built.error}`);
      await updateContact(built.data, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        tx,
        audit: {
          summary: `Updated ${suggestion.label.toLowerCase()} from a linked KYC/CDD form response`,
          metadata: {
            source: 'CONTACT_FORM_LINK',
            linkId: link.id,
            field: suggestion.field,
            formId: link.formId,
            submissionId: link.submissionId,
            personRowIndex: link.personRowIndex,
          },
        },
      });
    });
  } catch (error) {
    // Another contact took the ID between the check and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('This changed since you opened it. Refresh and try again.', 'STALE_SUGGESTION');
    }
    throw error;
  }
}

export async function dismissFormSuggestion(
  contactId: string,
  linkId: string,
  request: Pick<SuggestionRequest, 'field' | 'proposedValue'>,
  ctx: FormLinkContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockContact(tx, ctx.tenantId, contactId);
    const contact = await requireContact(tx, ctx.tenantId, contactId);
    const [loaded] = await loadLockedLink(tx, ctx.tenantId, contact, linkId);
    if (!loaded) throw new NotFoundError('Form link not found');
    if (loaded.state === 'RESPONSE_DELETED') throw conflict('The form response was deleted', 'RESPONSE_DELETED');
    if (loaded.state !== 'ACTIVE' || !loaded.person) {
      throw conflict('This form response changed. Unlink and link the person again.', 'ROW_CHANGED');
    }
    // Only a suggestion that is on offer right now can be dismissed.
    const suggestions = await suggestionsFor(tx, ctx.tenantId, contact, loaded.person);
    const suggestion = suggestions.find((candidate) => candidate.field === request.field && candidate.proposed === request.proposedValue);
    if (!suggestion) throw conflict('This changed since you opened it. Refresh and try again.', 'STALE_SUGGESTION');

    await tx.contactFormSuggestionDismissal.upsert({
      where: {
        linkId_field_valueHash: { linkId, field: suggestion.field, valueHash: suggestionValueHash(suggestion.field, suggestion.proposed) },
      },
      create: {
        tenantId: ctx.tenantId,
        linkId,
        field: suggestion.field,
        valueHash: suggestionValueHash(suggestion.field, suggestion.proposed),
        dismissedById: ctx.userId,
      },
      update: {},
    });
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'UPDATE',
      entityType: 'ContactFormLink',
      entityId: linkId,
      summary: `Dismissed a suggested ${suggestion.label.toLowerCase()} from a linked form response`,
      changeSource: 'MANUAL',
      metadata: { contactId, field: suggestion.field, action: 'DISMISS' },
    }, tx);
  });
}
