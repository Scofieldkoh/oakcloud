# Singapore Company Incorporation Intake Form

Status: implemented (template version 1). Source: the 2026-09-28 handover spec "ACRA incorporation intake form", treated as reference and checked against the code.

## What staff get

- **Forms > New form > Start from "Singapore Company Incorporation"** creates a DRAFT form through the normal form CRUD. Each click creates a new form; nothing is published until staff publish it in the builder.
- The public form has four question pages plus a review step:
  1. Company details (contact, proposed and alternative names, advisory name check, reservation status, primary and secondary SSIC, business description, company email, target date)
  2. Shareholders and directors (one repeat card per person or organisation, roles, ownership %, running total)
  3. Share capital and ownership (amount, currency, paid-up status, share structure, nominee and control questions)
  4. Registered office and company settings (office, resident director, secretary, first FYE, accounting period, constitution)
  5. Review and submit (every answer by page with Edit links, plus "Items requiring clarification")
- ACRA guidance G01–G12 sits on the relevant fields, with links that open in a new tab. `SG_COMPANY_INCORPORATION_GUIDANCE_REVIEWED_ON` records when the links were last checked.
- The form collects no KYC personal data, ID uploads, declarations or signatures. Those stay in the firm's KYC process.
- Completion emails are link-only (no PDF or uploads). The builder's Notifications section has a **Send link only** switch for any form.

## Rules

Code: `src/lib/forms/company-incorporation-profile.ts` (browser-safe, used by the review step and the server).

- **Blocking (`error`)**: invalid options from a direct API call, missing primary SSIC without an exception and reason, SSIC outside the pinned catalogue, secondary equal to primary, organisation as director, ownership outside (0, 100], a fully decided total other than exactly 100%, no parties, bad postal code, office open under 3 hours, paid-up above issued capital, impossible dates.
- **Needs information / staff review**: undecided allocations, unconfirmed name status or missing reference, name-check results other than "no match", firm services requested, nominee or control "Yes"/"Clarify", FYE more than 18 months out, custom constitution, and so on. These never stop the client from submitting.
- Percentages and amounts are compared as exact decimals (`src/lib/forms/decimal-string.ts`), never floats.

## Name check

- The field's new **Check mode** (builder > field > General) is `strict` (existing behaviour) or `advisory` (used by the template).
- In advisory mode the respondent can check and continue. On submit the server rechecks once with a 5-second bound; a timeout or outage records an "unavailable" result for staff instead of blocking. Client-supplied results for advisory fields are discarded.

## Storage and integrity

No Prisma migration. Everything is JSON:

- `Form.settings.template`: `{ key, version, installedAt, definitionHash, lockedAt }`. Server-owned; the builder cannot add, change or remove it, and Duplicate strips it.
- First publish sets `lockedAt` and a hash of the resolved definition. After that, field changes are rejected; the builder shows a "Questions are locked" notice. Title, settings and translations stay editable.
- `FormSubmission.metadata.companyIncorporation`: template version, profile version, definition hash and snapshot, issues, ownership total, party rows with immutable `party_<uuid>` ids, and SSIC codes with labels.
- `FormSubmission.metadata.companyIncorporationReview`: the staff checklist (below). Public payloads can never set either key.

## Staff checklist

On the response detail page, incorporation responses show **Company incorporation preparation**:

- Intake summary: SSIC labels, ownership total, the intake's flagged items.
- People and KYC: each roster row, plus people staff add (secretary, CEO, controller, nominator, representative). Each is linked to a KYC source, either another Oakcloud form response in the workspace or a location outside Oakcloud, with per-particular coverage ticks and a review status. A linked response that later changes or is deleted marks the link stale.
- Twelve checklist areas from the spec's internal ACRA preparation list.
- Readiness banner. "Ready for filing preparation" is internal only, not ACRA approval.
- Updates use an optimistic revision and a row lock, and each write is audit logged.

## Defaults chosen where the spec left a choice

- A **Start from template** option in the New form dialog instead of a seed script.
- The secondary SSIC field is always visible and optional, with no "Add secondary activity" toggle.
- Two separate alternative-name fields.
- The SSIC exception is a clearable dropdown. Clearing it returns the respondent to activity selection.
- Party cards stay editable inline rather than collapsing to a summary.
- KYC linking is manual. The tenant's real KYC form was not audited for coverage, so staff tick which particulars each source holds.

## Also fixed in existing Forms code

- Repeated short-text answers were dropped on submit, because a SHORT_TEXT case fell through to the name-check case. Every row is now kept.
- Required checks inside repeat sections used whole-array conditions. They now use each row's own answers and report "(row N)".

## Not done / follow-ups

- No Bizfile automation and no automatic Company record creation (out of scope by design).
- No coverage audit of the firm's live KYC form. Staff tick coverage by hand.
- A version 2 of the template would be a new manifest. Version 1 forms keep their frozen definition.
