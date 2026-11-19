# KYC/CDD form links on Contacts

A person on a KYC/CDD form response can be linked to a Contact. The contact page then shows the form
response, its PDF and that person's attachments, and offers the form's answers back as suggested
updates, **one field at a time, only when someone clicks Accept**. Linking changes nothing on the contact.

Code: `src/services/contact-form-link.service.ts`, the pure helpers `src/lib/contact-form-link.ts` and
`src/lib/contact-form-mapping.ts`, routes under `src/app/api/contacts/[id]/form-links/`, UI
`src/components/contacts/contact-form-links.tsx` (the "KYC/CDD forms" section of the contact page).

## What can be linked

- **Forms** that are not deleted and are tagged `cdd` or `kyc` (any case). The CDD template is a plain form tagged `cdd`.
- **One link is one person of one response.** A corporate CDD response lists several directors and shareholders in a repeat section: answers are parallel arrays per field key (`person_name[i]`, `person_id[i]`, ...). Single-person schemas use row index null, including the Individual Declaration even though it has repeat sections for PEP/nominee details.
- **Explicit schemas only.** Corporate CDD uses `person_*` keys. The Individual Declaration uses `full_name` and `nric_fin_passport_number` (both SHORT_TEXT definitions outside every repeat section) as identity, plus `nationality` (DROPDOWN), `date_of_birth` (SHORT_TEXT), `residential_address` (LONG_TEXT) and `politically_exposed_person_pep_status` (DROPDOWN). Optional fields are read only with those matching definitions. Its identity answers must be strings (leading zeros in IDs are preserved); malformed numeric values are not used as names or IDs. Its PEP/nominee rows are not additional people, and `full_name_declaration` and respondent metadata are never used as identity. The declaration's `nric`, `passport` and `proof_of_address` upload fields are whole-response files, still checked against the linked response.
- An `individual` row (or a row with no `person_kind`) links to an INDIVIDUAL contact; an `organisation` row to a CORPORATE contact; anything else is refused (422).
- The picker returns each person's fingerprint and the link request sends it back (`expectedFingerprint`). If the response changed between choosing and saving, the row no longer matches and the link is refused with 409 `ROW_CHANGED`: a link is never created for a different person than the one chosen.
- In the picker, the click is bound to the person as it was clicked (row and fingerprint). If a refresh of the list changes or removes that person, the choice is cleared and the user must pick again; the request is never built from a refreshed list for an earlier click.
- A row links to **one contact only**, and a contact links to a row once. Two partial unique indexes on active links (`unlinkedAt IS NULL`) enforce both. Unlinking is soft; relinking creates a new row.

## A link never jumps to another person

A row has no id of its own, so a link stores the row index **and** a fingerprint (sha256 of the person's kind, name and ID, normalised: case, spacing and ID punctuation ignored) taken when it was made. On every read and every write the row at the stored index is read again and compared:

| State | When | What the contact page shows |
| --- | --- | --- |
| `ACTIVE` | The row still has the same fingerprint (and kind) | Response link, PDF, attachments, suggestions |
| `ROW_CHANGED` | The index is gone, or the row now holds a different kind, name or ID | "This form response changed; unlink and link again." No suggestions, files or form details. Nothing is searched for at other rows |
| `RESPONSE_DELETED` | The response or the form is deleted | "Form response deleted." No suggestions or files; unlink still works |

## Suggested updates

Mapping (one config, `contact-form-mapping.ts`): individuals: name, ID number (the ID **type** is never changed), nationality, date of birth, address. Companies: company name, UEN. The politically-exposed-person answers are shown only and are never written to a contact.

- Suggestions are computed on read from the current answers and the current contact; only differences appear (compared after normalising case, spacing and ID format).
- A value that fails contact validation (for example a date of birth that is not real or outside 1 Jan 1900 to today), an ID or UEN another contact already has, or an ID for a contact with no ID type is shown as "Can't apply".
- **Accept** (`POST .../suggestions/accept`, one field per request) carries the value the user saw on the contact and the form value. In one transaction the contact row is locked, the link and the row are re-checked, both values are recomputed, and the single field is written through `contact.service` (validation and audit). Any difference answers **409** with `details.reason` `STALE_SUGGESTION` (or `ROW_CHANGED` / `RESPONSE_DELETED`) and writes nothing.
- **Dismiss** stores (link, field, hash of the proposed value). It stays hidden until the form answer changes.
- Accept, dismiss and link also hold the form and the response in place (a shared row lock) before reading them, so a response deleted while one of them runs is either seen as deleted (409 `RESPONSE_DELETED`) or the delete waits until the transaction ends: the contact is never written after the response is gone.
- The date of birth is written as midnight UTC of the calendar date, like every other date of birth.

## Permissions and tenants

| Action | Needs |
| --- | --- |
| See the section, list links, pick a form/response/person | `contact:read` **and** `document:read`. Without `document:read` the API answers 403 and the page shows nothing (not even form titles) |
| Link, unlink, accept, dismiss | `contact:update` **and** `document:read` |

Every query is scoped by tenant: another tenant's contact, form or response is a 404. Files are **not copied**: the response page, the PDF and each attachment open through the existing Forms routes (`/api/forms/[id]/responses/[submissionId]/export/pdf` and `.../uploads/[uploadId]`, which need `document:read`), and only uploads that belong to that response and that person's row (plus the response-level uploads such as company documents, i.e. fields outside every repeat section) are listed. Upload fields in a *different* repeat section belong to that section's rows and are never listed. The PDF is the whole response, so it includes every person on the form; it is labelled that way.

## Audit

Linking (`CREATE ContactFormLink`), unlinking (`DELETE`), dismissing (`UPDATE ContactFormLink`, `action: DISMISS`) and accepting (`UPDATE Contact`, metadata `source: CONTACT_FORM_LINK`, `linkId`, `field`, `formId`, `submissionId`, `personRowIndex`; a date of birth change also records `changes.dateOfBirth`). Summaries contain no ID numbers or dates of birth.

## Not included

Automatic linking by name, editing form answers, copying files into Documents, linking from the Forms response page, back-filling old responses, and Sentroweb re-screening. A contact's new date of birth is used by Sentroweb on the next manual check like any other.

## Tables

`contact_form_links` and `contact_form_suggestion_dismissals` (migration `20261119120000_contact_form_links`, additive). Rollback: drop the two tables.
