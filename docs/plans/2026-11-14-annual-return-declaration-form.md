# Annual Return Declaration form: revised seed and company-record prefill

Handover plan, written 2026-11-14. Nothing in this plan has been built.

- **Phase 1** seeds a revised Annual Return Declaration (ARD) form that fixes the AGM logic, captures financial statement dates and dissemination, and adds ACRA's 20 October 2026 questions.
- **Phase 2** lets staff send the form for a specific company with its Oakcloud records filled in, so the client confirms them.

## 1. Read this first

### 1.1 The existing form is not in the repository

The current "Annual Return Declaration" form was built in the form builder and lives only in the production database. The repository mentions it only as a test fixture title (`__tests__/app/public-form-page.test.tsx`). This plan was therefore written from ACRA's requirements and the owner's description of the shortfalls, not from the live field list.

**First task for the implementer:** export the live form's fields and reconcile them with section 4 before writing code.

```bash
npx tsx -e "import {prisma} from './src/lib/prisma'; const f = await prisma.form.findFirst({ where: { title: 'Annual Return Declaration', deletedAt: null }, include: { fields: { orderBy: { position: 'asc' } } } }); console.log(JSON.stringify(f, null, 2)); await prisma.\$disconnect();"
```

Reconcile as follows:

- Keep any live question that section 4 lacks, unless it conflicts with section 3.
- Where a live question matches one in section 4, reuse the live field key so old and new responses export under the same column.
- Remove the live "no AGM because all shareholders agree to waive" option. Section 3.2 gives the replacement.

### 1.2 Decisions the owner still has to make

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Whether to offer "AGMs dispensed with by resolution" as an answer (section 3.2). | Offer it, with the date of the resolution. It is a lawful route and Bizfile asks for it. |
| D2 | How much personal data the prefilled form shows (section 5.6). | Mask identification numbers, show addresses. |
| D3 | Whether Phase 2 shows officers and shareholders as read-only text or as a new table field (section 5.4). | Read-only text first. |
| D4 | Title of the new form. | Keep "Annual Return Declaration"; staff archive the old one after publishing the new one. |

### 1.3 What could not be verified

Singapore Statutes Online refused automated requests (HTTP 403), so no Companies Act wording was read directly. Section numbers in this plan come from memory and secondary sources and are marked "verify". The rules themselves come from ACRA's own pages, which were read on 2026-11-14. Check each "verify" item against the Act before publishing the form.

## 2. Sources

| Ref | Page | Last updated |
|-----|------|--------------|
| S1 | [ACRA: Commencement of key changes on 20 October 2026](https://www.acra.gov.sg/news-events/news-announcements/commencement-of-key-changes-under-the-corporate-and-accounting-laws--amendment--act-2025-on-20-october-2026/) | Published 6 Oct 2026 |
| S2 | [ACRA: AGM due dates and requirements](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/holding-annual-general-meetings/due-dates-requirements/) | 11 Feb 2026 |
| S3 | [ACRA: Steps to file an annual return](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/steps-to-file/) | 19 Oct 2026 |
| S4 | [ACRA: Annual return deadlines](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/deadline-requirements/) | 14 May 2026 |
| S5 | [ACRA: Audit exemptions, small company concept](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/preparing-financial-statements/audit-exemptions/) | Not read this session; verify the thresholds |
| S6 | [Companies Act 1967](https://sso.agc.gov.sg/Act/CoA1967) | Not readable this session |

## 3. Requirements the form must reflect

### 3.1 Deadlines (S2, S4)

| Company | AGM | Annual return |
|---------|-----|---------------|
| Listed | Within 4 months after the financial year end (FYE) | Within 5 months after FYE |
| Not listed | Within 6 months after FYE | Within 7 months after FYE |

Companies with a share capital that keep an overseas branch register get one more month for the annual return. These match the existing deadline rules `SG_AGM_DUE` and the annual return rule in `src/services/compliance-monitoring/catalog.ts`.

### 3.2 When a company need not hold an AGM (S2)

Only a **private** company can skip the AGM, and only by one of three routes. Public companies must always hold one.

| Route | Condition | What the form must capture |
|-------|-----------|----------------------------|
| A. Financial statements sent | Financial statements sent to all members within 5 months after FYE. | Date sent. |
| B. Dispensed by resolution | All members entitled to vote passed a resolution to dispense with AGMs. | Date of the resolution; date financial statements were sent. |
| C. Dormant | Dormant, not listed and not a subsidiary of a listed company, total assets of S$500,000 or less (consolidated if it is an ultimate parent). | Confirmation of each condition. |

Two safeguards apply even when a route is met (S2):

- A member may ask for an AGM up to 14 days before the end of the sixth month after FYE. The company must then hold it within 6 months after FYE.
- A member or the auditor may ask for a general meeting within 14 days of receiving the financial statements. The company must hold it within 14 days of the request.

**On the reported mistake.** The owner described the fault as "we allowed the user to not hold an AGM if all shareholders agree to waive". ACRA's page does list a unanimous members' resolution as a valid route (route B), so the law does allow something close to this. The fault in the old form is narrower:

- an informal agreement to waive is not a resolution passed by all members entitled to vote;
- the route is not open to public companies;
- the form did not record when the financial statements went to members;
- the form did not ask whether a member or the auditor had asked for a meeting.

The redesign replaces the waiver option with routes A to C and the two safeguard questions. If the owner would rather not offer route B at all (decision D1), delete option `dispensed` from `agm_option`; a client relying on a dispensation resolution would then pick route A, which fits as long as the financial statements went out within 5 months.

Verify on S6: section 175A (the three routes and safeguards), and whether section 203 requires the financial statements to be sent within 5 months after FYE when route B applies. ACRA's pages do not state the second point; the form asks for the date in both cases.

### 3.3 Financial statements (S3)

The annual return asks for the following, so the declaration must collect them:

- the financial period;
- whether the company was dormant;
- whether the financial statements are audited, and audit details if so;
- for an exempt private company, whether it is solvent;
- the AGM date, or the date the financial statements were sent to members when no AGM was held.

One director signs the directors' statement if the company has a sole director; otherwise at least two sign (S3).

Small company audit exemption (S5, verify): a private company qualifies if it meets two of three tests for the two preceding financial years: revenue of S$10 million or less, total assets of S$10 million or less, 50 employees or fewer. A company in a group also needs the whole group to qualify as a small group.

### 3.4 Changes from 20 October 2026 (S1, S3)

1. **CEO question.** The annual return asks whether any individual performs the role of chief executive officer. ACRA's filing guide says to answer yes "if the company has any individuals who perform the role of a CEO", and that the CEO must then be appointed and shown as a position holder. The test is the role performed, not the job title.
2. **Confirmation of particulars.** The filer confirms that the latest particulars given to ACRA are accurate for directors, CEOs, secretaries, auditors and members. S1 lists names, identification details, nationality, contact address, appointment dates, registered office address and shareholding details.
3. **Companies limited by guarantee** confirm the total number of members last given to ACRA.
4. **Registered office.** The minimum public opening hours are abolished. A company must still make records available for inspection on reasonable notice, for at least two hours on each relevant business day. Remove any opening-hours question from the form.

ACRA has not published the exact wording of the new declarations. Verify on S6: the definition of "chief executive officer" in section 4 (from memory: a person, by whatever name described, who is employed by or acts for the company and is principally responsible for the management and conduct of its business) and the 14-day period for notifying ACRA of a CEO's appointment.

## 4. Phase 1: the revised form

### 4.1 How to build it

Follow the Singapore Company Incorporation form, which is a guided template with stable keys:

| Piece | File | Notes |
|-------|------|-------|
| Field definitions | `src/lib/form-templates/sg-annual-return-declaration.ts` (new) | Export `SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration'`, version `1`, title, a `ANNUAL_RETURN_KEYS` constant, `buildSgAnnualReturnDeclarationFields({ firmName })` and `buildSgAnnualReturnDeclarationSettings({ firmName })`. Reuse the helper style in `sg-company-incorporation.ts` (`heading`, `info`, `requirements`, `tickBox`, `eq`, `all`, `any`). |
| Registry | `src/lib/form-templates/index.ts` | Add to `FORM_TEMPLATES`; add `isAnnualReturnDeclarationForm(settings)`. |
| Seed service | `src/services/form-template.service.ts` | Add `seedAnnualReturnDeclarationForm(params)`. Extract the shared part of `seedCompanyIncorporationForm` (find unlocked draft, create or update, write the binding) into one helper instead of copying it. |
| Script | `scripts/seed-annual-return-declaration-form.ts` (new) | Copy `scripts/seed-incorporation-form.ts`. Usage: `npx tsx scripts/seed-annual-return-declaration-form.ts --email <login>`. Add `db:seed-annual-return-declaration` to `package.json`. |
| Tests | `__tests__/lib/annual-return-declaration-template.test.ts` (new) | See section 4.5. |
| Docs | `docs/README.md` or the forms section of `docs/ARCHITECTURE.md` | One paragraph on the seed and the template. |

Reasons for a guided template instead of a plain form like the CDD starter:

- Phase 2 reads and writes answers by key, and the template binding locks fields on first publication (`form-crud.service.ts`, `lockedAt`).
- The binding lets the server recognise the form without matching on its title.

The seed creates a draft, or updates the unpublished draft it seeded earlier. It never touches a published form, so the live form keeps working until staff publish the new one and archive the old one. Tag the form `annual-return`.

Settings: drafts enabled with 30-day deletion, review step on, PDF actions on, success message "Reference: {reference}. {firm} will prepare the annual return and contact you if anything else is needed."

### 4.2 Field list

Types and validation names are those in `src/lib/validations/form-builder.ts`. "Yes/no" means a required `SINGLE_CHOICE` with values `yes` and `no` and `choiceInlineRight`. "Date" means `SHORT_TEXT` with `inputType: 'date'`. Every field is required unless marked optional.

#### Page 1: Company and financial year

| Key | Type | Label | Rules |
|-----|------|-------|-------|
| `intro` | Info | Why we ask, what to have ready (signed financial statements, AGM or resolution dates). | Not in PDF. |
| `prefill_source` | `HIDDEN` | | Empty in Phase 1. Phase 2 sets `company_record`. |
| `company_name` | Text | Company name | |
| `company_uen` | Text | UEN | Width 50. Pattern for 9 or 10 character UENs. |
| `company_type` | Single choice | Company type | `private_limited`, `exempt_private_limited`, `public_limited`, `public_guarantee`. Help text explains an exempt private company (20 members or fewer, none a corporation). |
| `company_listed` | Yes/no | Is the company listed on a securities exchange, or a subsidiary of a listed company? | Shown for the two public types and asked of private types as "subsidiary of a listed company". |
| `fy_start_date` | Date | Financial year start | Width 50. `maxDateFieldKey: fye_date`. |
| `fye_date` | Date | Financial year end | Width 50. `maxDate: today`. |
| `fye_changed` | Yes/no | Has the financial year end changed since the last annual return? | |
| `fye_changed_details` | Long text | Previous financial year end and when the change was filed | If `fye_changed = yes`. |
| `activity_status` | Single choice | During this financial year the company was | `active`, `dormant` ("no accounting transactions for the whole year"). Help text lists what does not count as a transaction (secretary fees, ACRA fees, share subscription on incorporation). |
| `dormant_assets_within_limit` | Yes/no | Were total assets S$500,000 or less at any time in the year (consolidated if the company is a parent)? | If `dormant`. |

#### Page 2: Financial statements

| Key | Type | Label | Rules |
|-----|------|-------|-------|
| `fs_prepared` | Single choice | Financial statements for this year | `prepared`; `not_prepared_dormant` ("Not prepared: dormant company exempt from preparing them"), offered only if `dormant`, not listed and assets within the limit. |
| `fs_directors_statement_date` | Date | Date of the directors' statement (date the directors approved the financial statements) | If `prepared`. `minDateFieldKey: fye_date`, `maxDate: today`. This is the "date of the financial statements" the old form lacked. |
| `fs_signatories` | Text | Directors who signed the directors' statement | If `prepared`. Subtext: one director if sole director, otherwise at least two. |
| `fs_audit_status` | Single choice | Are the financial statements audited? | If `prepared`. `audited`; `unaudited_small` ("No: small company audit exemption"), private types only; `unaudited_dormant` ("No: dormant company audit exemption"), if `dormant`. |
| `small_company_confirm` | Tick box | Confirmation of the small company tests in section 3.3 | If `unaudited_small`. Help text gives the three tests and the group condition. |
| `auditor_name` | Text | Audit firm | If `audited`. |
| `auditor_report_date` | Date | Date of the auditor's report | If `audited`. `minDateFieldKey: fs_directors_statement_date`, `maxDate: today`. |
| `auditor_opinion` | Single choice | Auditor's opinion | If `audited`. `unmodified`, `qualified`, `adverse`, `disclaimer`. |
| `auditor_emphasis` | Yes/no | Does the report include an emphasis of matter or a material uncertainty on going concern? | If `audited`. |
| `epc_solvent` | Yes/no | Can the company pay its debts as they fall due? | If `company_type = exempt_private_limited`. Help text: an insolvent exempt private company must file its financial statements. |
| `fs_file` | File upload | Signed financial statements (PDF) | If `prepared`. PDF only, 20 MB. Optional if the firm prepared them; say so in the subtext. |
| `fs_sent_to_members` | Yes/no | Have the financial statements been sent to every member? | If `prepared`. |
| `fs_sent_date` | Date | Date sent to members | If sent. `minDateFieldKey: fs_directors_statement_date`, `maxDate: today`. |
| `fs_sent_method` | Multiple choice | How they were sent | If sent. `email`, `post`, `by_hand`, `other` with text input. |
| `fs_not_sent_block` | Info, `infoStopsProgress` | "The financial statements must go to every member before the AGM, or within 5 months after the financial year end if no AGM is held. Please send them, or contact us." | If `prepared` and not sent. |

#### Page 3: Annual general meeting

| Key | Type | Label | Rules |
|-----|------|-------|-------|
| `agm_guidance` | Info | Plain summary of section 3.2 with a link to S2. | |
| `agm_option` | Single choice | For this financial year, the company | `held` ("Held an AGM"); `fs_sent` ("Did not hold an AGM: financial statements were sent to all members within 5 months after the financial year end"); `dispensed` ("Did not hold an AGM: all members passed a resolution to dispense with AGMs"); `dormant_exempt` ("Did not hold an AGM: dormant company exempt from preparing financial statements"). Use option conditions so the last three appear only for private types, and `dormant_exempt` only when `fs_prepared = not_prepared_dormant`. |
| `agm_date` | Date | Date of the AGM | If `held`. `minDateFieldKey: fye_date`, `maxDate: today`. |
| `agm_fs_notice` | Yes/no | Were the financial statements sent at least 14 days before the AGM? | If `held`. |
| `agm_short_notice_confirm` | Tick box | "Every person entitled to receive them agreed to a shorter period." | If `agm_fs_notice = no`. |
| `dispense_resolution_date` | Date | Date of the resolution to dispense with AGMs | If `dispensed`. `maxDate: today`. |
| `dispense_resolution_confirm` | Tick box | "The resolution was passed by all members entitled to vote and has not been revoked." | If `dispensed`. |
| `agm_requested` | Yes/no | Did any member or the auditor ask for an AGM or general meeting for this year? | If `fs_sent` or `dispensed`. Help text gives the two safeguards. |
| `agm_requested_block` | Info, `infoStopsProgress` | "Because a meeting was requested, the company must hold it. Choose 'Held an AGM' and give its date, or contact us." | If `agm_requested = yes`. |
| `agm_late_note` | Info | "The AGM was due within {4 or 6} months after the financial year end. If it was later, tell us so we can deal with the extension or late filing." | If `held`. Two blocks, one per listed answer. |

The 5-month limit on `fs_sent_date` cannot be a hard rule today: date validation offsets are in days (`maxDateOffsetDays`), and 5 months is not a fixed number of days. Do not approximate it. Phase 1 states the limit in the option label and leaves the check to staff. Phase 2 adds a computed check (section 5.5). If a hard rule is wanted, add `minDateOffsetMonths` and `maxDateOffsetMonths` to `fieldValidationSchema` and to the client and server date checks as separate work.

#### Page 4: Officers, CEO and company records

| Key | Type | Label | Rules |
|-----|------|-------|-------|
| `ceo_exists` | Yes/no | Does any individual perform the role of chief executive officer of the company? | Help text: the test is the role, not the title; a managing director or general manager who runs the business counts; give the section 4 definition once verified. |
| `ceo_section` | Repeat section | CEO | If yes. 1 to 5 items. |
| `ceo_name` | Text | Full name | In section. |
| `ceo_id_number` | Text | NRIC, FIN or passport number | In section. Width 50. |
| `ceo_appointment_date` | Date | Date appointed | In section. Width 50. `maxDate: today`. |
| `ceo_is_director` | Yes/no | Is this person also a director? | In section. |
| `ceo_registered` | Single choice | Has this person been registered with ACRA as CEO? | In section. `yes`, `no`, `not_sure`. Subtext: "If not, we will file the appointment before the annual return." |
| `particulars_guidance` | Info | From 20 October 2026 the annual return confirms that ACRA's records of directors, CEOs, secretaries, auditors and members are accurate (link S1). | |
| `changes_since_last_ar` | Multiple choice | Since the last annual return, has any of the following changed without you telling us? | `none` (exclusive by wording), `director_or_secretary` (appointment, resignation, name, ID, nationality, address), `auditor`, `shareholders_or_shares`, `registered_office`, `business_activities`, `controllers`, `nominees` (nominee directors or shareholders), `charges`. |
| `changes_details` | Long text | Describe each change and its date | If anything other than `none` is ticked. Max 3000. |
| `guarantee_member_count` | Number | Total number of members | If `company_type = public_guarantee`. Integer, min 1. |
| `registered_office_records` | Tick box | "Company records at the registered office can be inspected on reasonable notice, for at least two hours on each business day." | Replaces any opening-hours question. |

`changes_since_last_ar` cannot enforce that `none` excludes the others. Add a stop block shown when `none` and any other value are both ticked, using an `and` condition over `contains` rules.

#### Page 5: Declaration

| Key | Type | Label | Rules |
|-----|------|-------|-------|
| `declaration_true` | Tick box | "I declare that the information in this form is true and complete." | |
| `declaration_authorise` | Tick box | "I authorise {firm} to file the annual return with ACRA using this information." | |
| `declarant_name` | Text | Name of director making this declaration | Width 50. |
| `declarant_email` | Email | Email | Width 50. |
| `declaration_date` | Date | Date | `alwaysDefaultToday`, read-only. |
| `declarant_signature` | Signature | Signature | |
| `other_notes` | Long text | Anything else we should know | Optional. |

### 4.3 Logic checks to cover

| Case | Expected |
|------|----------|
| Public company | Only `held` is offered in `agm_option`; small company audit exemption is not offered. |
| Private, active, unaudited | Small company confirmation required. |
| Private, route A | `fs_sent_date` and `agm_requested` required; no `agm_date`. |
| Private, route B | Resolution date and confirmation, `fs_sent_date` and `agm_requested` required. |
| Dormant, statements not prepared | Pages 2 and 3 collapse to the dormant answers; no upload, no sent date. |
| A meeting was requested | Progress stops until the respondent picks `held`. |
| Exempt private company | Solvency question shown. |
| CEO yes | At least one CEO row. |

### 4.4 Out of scope for Phase 1

- XBRL preparation and the accounting standard questions; staff handle these at filing.
- Register of controllers and nominee register locations; staff hold these. The form only asks whether anything changed.
- Any change to the old published form or its responses.

### 4.5 Tests

- The built fields pass `saveFormFieldsSchema`, keys are unique and every condition refers to an existing key (the CDD test in `__tests__/lib/corp-sec-templates.test.ts` is the model).
- Each row of section 4.3, using `evaluateCondition` and `validateRequiredPublicAnswers`.
- The seed creates a draft, updates an unlocked draft, and creates a new draft beside a published form (model: the incorporation seed tests).
- Run `npm run typecheck`, `npm run lint` and the form suites.

## 5. Phase 2: fill the form from the company record

### 5.1 What exists today

| Finding | Where |
|---------|-------|
| Public forms take no company context. The page reads only `lang`, `draft`, `resume`, `embed` and `preview` from the URL. | `src/app/(public)/forms/f/[slug]/page.tsx` |
| Drafts are stored server-side and reopened by a link carrying a code and a secret token. Staff can already generate a resume link for a draft. | `src/services/form-draft.service.ts` (`createFormDraftRecord`, `generateFormDraftResumeLink`) |
| Submissions and drafts have no company column; both have a JSON `metadata`. | `FormSubmission`, `FormDraft` in `prisma/schema.prisma` |
| `isReadOnly` is enforced in the browser only. The server accepts any value for a read-only field. | No `isReadOnly` reference under `src/services` |
| Saving a draft from the browser rebuilds its metadata from an allow-list, so unknown keys are dropped. | `normalizeDraftMetadata` |
| Repeat sections store one array per field key, with row counts in `metadata.repeatSectionCounts`. | `validateRequiredRepeatRows`, `normalizeDraftMetadata` |
| A staff-only review stored in submission metadata already exists for incorporation. | `src/lib/forms/company-incorporation-review.ts`, `/api/forms/[id]/responses/[submissionId]/incorporation-review` |

### 5.2 Recommended approach: a prefilled draft per company

Staff choose a company and the server creates a draft of the published ARD form with the company's records already in it, then gives staff the resume link to send. It reuses the draft and resume mechanism, so the public page needs no new data endpoint and no company data is reachable without the draft's secret token.

Alternatives considered:

| Option | Why not |
|--------|---------|
| A company token in the URL with a public endpoint returning company data | New public surface exposing personal data; duplicates what drafts already do. |
| Client portal login (`ClientPortalUser` exists) | Much larger build; clients would need accounts. |

### 5.3 Data mapping

All values come from `getCompanyFullDetails` (`src/services/company.service.ts`). Build the mapping as a pure function, `buildAnnualReturnPrefill(company)`, in `src/lib/forms/annual-return-prefill.ts`.

| Form shows | Source | Notes |
|------------|--------|-------|
| UEN | `Company.uen` | Fills `company_uen`. |
| Company name | `Company.name` | Fills `company_name`. |
| Entity type | `Company.entityType` | Maps to `company_type`: `PRIVATE_LIMITED`, `EXEMPTED_PRIVATE_LIMITED`, `PUBLIC_LIMITED`, `PUBLIC_COMPANY_LIMITED_BY_GUARANTEE`. Refuse to prefill for any other type. |
| Entity status | `Company.status` | Display label. Warn staff if not `LIVE`. |
| Business activity | `primarySsicCode`, `primarySsicDescription`, and the secondary pair | |
| Registered office | `CompanyAddress` where `addressType = REGISTERED_OFFICE` and `isCurrent` | Use `fullAddress`. |
| Position holders | `CompanyOfficer` where `isCurrent` | Role, name, identification (masked), nationality, address, appointment date. Roles include `CEO`, so the record also answers "who is on file as CEO". |
| Auditor | `CompanyAuditor` | Name and appointment date. S1 lists auditors among the particulars to confirm. |
| Share capital | `ShareCapital` rows, `issuedCapitalAmount`, `paidUpCapitalAmount` and their currencies | Class, currency, number of shares, amount, paid up or not, treasury or not. |
| Shareholders | `CompanyShareholder` where `isCurrent` | Name, type, identification (masked), class, number of shares, percentage, nominee flag. |
| Financial year | `financialYearEndDay`, `financialYearEndMonth`, `fyeAsAtLastAr`, `CompanyFinancialPeriod` | Suggest `fy_start_date` and `fye_date` as the period after `fyeAsAtLastAr`; leave them editable. |

Display labels for entity type, status and officer role already exist; reuse them (see `src/services/bizfile/canonical-values.ts` and the company detail components) instead of adding new maps.

### 5.4 Form changes (template version 2)

Add a "Company records" page after page 1, shown only when `prefill_source = company_record`:

| Key | Type | Content |
|-----|------|---------|
| `record_as_at` | Read-only text | Date and time the snapshot was taken. |
| `record_company` | Read-only long text | Entity type, status, business activities, registered office. |
| `record_officers` | Read-only long text | One line per position holder. |
| `record_share_capital` | Read-only long text | One line per share class, then issued and paid-up totals. |
| `record_shareholders` | Read-only long text | One line per shareholder. |
| `record_company_correct`, `record_officers_correct`, `record_share_capital_correct`, `record_shareholders_correct` | Yes/no | "Is this accurate and complete?" One per block, placed under it. |
| `record_*_corrections` | Long text | "What is wrong or missing?" Shown when the matching answer is no. |

With these in place:

- `company_name`, `company_uen` and `company_type` become read-only when prefilled;
- `changes_since_last_ar` is hidden when prefilled, because the per-block confirmations replace it;
- the CEO question stays, with a line above it stating who the record shows as CEO, or that it shows none.

Read-only long text is recommended over a new table field type (decision D3) because it needs no change to the form engine, the review step or the PDF. A structured `RECORD_TABLE` field with per-row confirmation would read better and could be a later improvement. Before committing, check how a read-only `LONG_TEXT` with 20 or more lines looks on the public page and in the PDF.

Because the template locks on publication, version 2 arrives as a new draft beside the published version 1. If Phase 2 will follow Phase 1 closely, include the section 5.4 fields in version 1 so the form is published once; they stay hidden while `prefill_source` is empty.

### 5.5 Server work

1. **Create the draft.** Add `createPrefilledFormDraft(formId, answers, serverMetadata, params)` to `form-draft.service.ts`, wrapping `createFormDraftRecord`. It requires a published form with drafts enabled. Store under one server-owned metadata key (for example `__oak_prefill`): `companyId`, `companyAggregateRevision`, `createdAt`, `createdById` and the snapshot answers.
2. **Keep server-owned metadata.** `savePublicDraft` currently replaces metadata on every save. Carry `__oak_prefill` forward the same way the resume token is carried, strip it in `sanitizeDraftMetadataForClient`, and never accept it from the browser.
3. **Enforce the snapshot.** On each draft save and on submission, overwrite the read-only prefilled keys with the snapshot values. The browser's read-only flag is not a control.
4. **Link the submission.** In `createPublicSubmission`, when the active draft has `__oak_prefill`, copy `companyId` and the snapshot to `FormSubmission.metadata` server-side. Check that `sanitizeSubmissionMetadata` cannot be used to forge or drop it. A `companyId` column on `FormSubmission` would allow indexed lookups from the company page; metadata is enough to start.
5. **Staff API.** `POST /api/forms/[id]/prefilled-drafts` with `{ companyId }` returns the resume link. Require form access and read access to that company, scope every query by tenant, and write an audit log entry (see `docs/guides/RBAC_GUIDELINE.md` and `AUDIT_LOGGING.md`).
6. **Staff screens.** A "Send annual return declaration" action on the company page that creates the draft and shows the link to copy; emailing it can reuse the draft email service. On the response page, an "Annual return check" panel modelled on the incorporation review.
7. **Computed checks in that panel:** financial statements sent within 5 months after FYE when no AGM was held; AGM within 4 or 6 months; CEO answer against CEO officers on record; each block the client marked inaccurate, with its correction text; whether the company record changed after the snapshot (`aggregateRevision`).
8. **No automatic updates.** Corrections go to staff, who update the record through the usual company and BizFile flows.

### 5.6 Privacy and data quality

- The resume link is a bearer secret. Anyone holding it sees the prefilled data until the draft expires (30 days by default).
- Recommendation for D2: mask identification numbers to the last four characters, as the PDPC's NRIC guidance favours, and show addresses because ACRA asks for them to be confirmed. The client confirms an ID by its tail and writes the full number only if it is wrong.
- The snapshot is only as current as the company record. Show `record_as_at` on the form, and have the send action warn staff when the record has no recent BizFile or ACRA sync.
- The snapshot stored on the submission is the evidence of what the client confirmed. Keep it unchanged after submission.

### 5.7 Tests

- `buildAnnualReturnPrefill`: each mapping row, masking, ceased officers and former shareholders excluded, unsupported entity type refused.
- Draft service: server metadata survives a public save; a tampered read-only value is restored; the client never receives `__oak_prefill`.
- Submission: `companyId` and snapshot copied from the draft; a browser-supplied `companyId` is ignored.
- API: a user without access to the company is refused; another tenant's company is not found.
- PostgreSQL suites and browser tests run as described in `CLAUDE.md`.

## 6. Suggested order of work

1. Export and reconcile the live form (section 1.1); get decisions D1 to D4.
2. Verify the "verify" items in section 3 against the Companies Act.
3. Phase 1: template file, registry entry, seed service, script, tests, docs.
4. Staff review the seeded draft in the builder, publish it, archive the old form.
5. Phase 2: prefill function, draft service changes, submission link, API, staff screens, review panel.
