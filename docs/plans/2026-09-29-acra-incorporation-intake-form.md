# Singapore Company Incorporation Intake Form

Status: implemented (template version 2). Source: the 2026-09-28 handover spec "ACRA incorporation intake form", treated as reference and checked against the code. Version 2 follows Scofield's 19-point review of version 1 (2026-09-29).

## What staff get

- **Seeding**: `npx tsx scripts/seed-incorporation-form.ts --email <login>` creates the form as a DRAFT in the user's workspace. Running it again updates the unpublished copy in place with the current questions. A published (locked) copy is never changed; a new draft is created beside it. There is no "Start from" choice in the New form dialog.
- The public form has four question pages plus a review step:
  1. Company details: contact name and email, company type (private or public limited by shares), proposed name and two alternative names (all advisory name-checked), primary SSIC (required) and optional secondary SSIC, business description, company email.
  2. Shareholders and officers: one card per person or company. Type and roles are buttons (Shareholder, Director, Managing director, CEO, Company secretary). Shareholding %, email, UEN for a company, and per-person ticks: lives in Singapore (directors), nominee shareholder, nominee director, other control, with "acts on behalf of" when a nominee box is ticked.
  3. Share capital and services: issued capital, currency, number of shares, fully paid (Yes/No, then amount paid); tick boxes for our nominee director service and company secretary service.
  4. Registered office and other details: own address or our registered office service, first FYE (12-month periods assumed), model or custom constitution, additional instructions.
  5. Review and submit (every answer by page with Edit links, plus items for our review).
- ACRA guidance sits on the relevant fields, with links that open in a new tab. Help on half-width fields is a tooltip, so fields side by side keep the same height.
- The form collects no KYC personal data, ID uploads, declarations or signatures. Those stay in the firm's KYC process.
- Completion emails are link-only (no PDF or uploads). The builder's Notifications section has a **Send link only** switch for any form.
- Choice fields have a **Show options as buttons** switch in the builder (`validation.choiceLayout: 'chips'`).

## Rules

Code: `src/lib/forms/company-incorporation-profile.ts` (browser-safe, used on each page, on the review step and on the server).

- **Blocking (`error`)**, checked when the respondent presses Continue on the page the rule belongs to, and again on submit:
  - names must end to match the company type (private: "Pte. Ltd." or "Private Limited"; public: "Limited" or "Ltd."), and must differ from each other;
  - primary SSIC required and in the pinned catalogue; secondary different from primary; business description required;
  - every person has a role; a company can only be a shareholder; each person is listed once; nominees name who they act for;
  - shareholdings total exactly 100%, at least one shareholder and one individual director (director or managing director); at most 50 shareholders for a private company; a company secretary cannot be the only director;
  - number of shares is a whole number and each shareholding gives whole shares; amount paid is below the capital when not fully paid;
  - at least one director lives in Singapore, or our nominee director service is ticked;
  - 6-digit postal code; a real FYE date; option values from the form only.
- **Staff review** (stored, never blocking): names not checked or with matches, FYE more than 18 months away.
- Percentages and amounts are compared as exact decimals (`src/lib/forms/decimal-string.ts`), never floats.

## Name check

- The field's **Check mode** (builder > field > General) is `strict` or `advisory` (used by the template for all three names).
- In advisory mode the respondent can check and continue. On submit the server rechecks every advisory name at once with a 5-second bound; a timeout or outage records an "unavailable" result for staff instead of blocking. Client-supplied results for advisory fields are discarded.

## Storage and integrity

No Prisma migration. Everything is JSON:

- `Form.settings.template`: `{ key, version, installedAt, definitionHash, lockedAt }`. Server-owned; the builder cannot add, change or remove it, and Duplicate strips it.
- First publish sets `lockedAt` and a hash of the resolved definition. After that, field changes are rejected; the builder shows a "Questions are locked" notice.
- `FormSubmission.metadata.companyIncorporation` (profile version 2): template version, definition hash and snapshot, issues, ownership total, company type, number of shares, and party rows with immutable `party_<uuid>` ids, shares per shareholder and the per-person ticks. Version 1 records still display.
- `FormSubmission.metadata.companyIncorporationReview`: the staff checklist (below). Public payloads can never set either key.

## Staff checklist

On the response detail page, incorporation responses show **Company incorporation preparation**:

- Intake summary: SSIC labels, ownership total and number of shares, the intake's flagged items.
- People and KYC: each person with roles, shareholding and shares, and ticks (resident, nominee, acts for, other control), plus people staff add. Each is linked to a KYC source with per-particular coverage ticks and a review status.
- Twelve checklist areas from the spec's internal ACRA preparation list.
- Readiness banner. "Ready for filing preparation" is internal only, not ACRA approval.

## Defaults chosen

- Shares are ordinary shares paid in cash; the model constitution is adopted as-is.
- Office hours are not asked: the rule that a registered office opens at least three hours on business days was removed with effect from 6 May 2026.
- COO and CFO are not ACRA positions, so they are not roles.
- KYC linking is manual.

## Not done / follow-ups

- No Bizfile automation and no automatic Company record creation (out of scope by design).
- No coverage audit of the firm's live KYC form. Staff tick coverage by hand.
