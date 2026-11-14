# Annual Return Declaration form: revised seed and company-record prefill

Handover plan, written 2026-11-14. Nothing in this plan has been built.

- **Phase 1** seeds a revised Annual Return Declaration (ARD) form, based on the live form, that removes the unlawful AGM dispensation path, captures the date and circulation of the financial statements, and adds ACRA's 20 October 2026 questions.
- **Phase 2** lets staff send the form for a specific company with its Oakcloud records filled in. The client can edit them, and anything edited is highlighted.

**Scope rule from the owner:** ask only what is needed to file the annual return and to prepare the related resolutions. Do not add questions beyond section 4.4.

## 1. Read this first

### 1.1 The base form

The live form is "Annual Return Declaration" (slug `annual-return-declaration`, published, 42 fields, one page in three parts plus a declaration). It is not in the repository; the owner supplied an export of its configuration and section 4 is written against it. The export is not committed because its settings contain staff email addresses.

The form is forward-looking: a director completes it before the AGM and the filing, and the firm uses the answers to prepare the AGM notice, minutes, resolutions and the annual return. Keep that purpose.

### 1.2 Decisions already made by the owner

| Topic | Decision |
|-------|----------|
| Dispensing with AGMs | Not offered anywhere in the form: no question about a resolution in force and no agenda item. |
| Shareholder consent to omit directors' interests | The existing question stays as it is. |
| Personal data on the prefilled form | Shown in full, no masking. ACRA's business profile shows the same information. |
| Prefilled company records | Editable by the client. An edited value changes background colour. |

### 1.3 Sources

| Ref | Source |
|-----|--------|
| S1 | [ACRA: Commencement of key changes on 20 October 2026](https://www.acra.gov.sg/news-events/news-announcements/commencement-of-key-changes-under-the-corporate-and-accounting-laws--amendment--act-2025-on-20-october-2026/), published 6 Oct 2026 |
| S2 | [ACRA: AGM due dates and requirements](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/holding-annual-general-meetings/due-dates-requirements/) |
| S3 | [ACRA: Steps to file an annual return](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/steps-to-file/), updated 19 Oct 2026 |
| S4 | [ACRA: Annual return deadlines](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/deadline-requirements/) |
| CA | [Companies Act 1967](https://sso.agc.gov.sg/Act/CoA1967), sections 142 to 209, version as at 14 Nov 2026, read from extracts the owner supplied |

Two points are not verified. The small company thresholds (Thirteenth Schedule) and the definition of "chief executive officer" (section 4) are outside the extracts. The form avoids depending on either: it uses ACRA's own wording for the CEO question and does not restate the thresholds.

## 2. Requirements the form must reflect

### 2.1 Deadlines

| Company | AGM (CA s 175(1)) | Annual return (CA s 197(1)) |
|---------|-------------------|------------------------------|
| Listed public company | Within 4 months after the financial year end (FYE) | Within 5 months after FYE |
| Any other company | Within 6 months after FYE | Within 7 months after FYE |

### 2.2 When a company need not hold an AGM (CA s 175A)

Only a private company can be exempt, by one of three routes in section 175A(1):

| Route | Condition |
|-------|-----------|
| (a) Dispensation | A resolution to dispense with AGMs is in force. Under s 175A(2) it must be passed at a general meeting by all members who vote, and s 184A(2) bars passing it by written means. |
| (b) Circulation | The financial statements were sent to all persons entitled to receive notice of general meetings within 5 months after FYE (s 203(1)(b)). |
| (c) Dormant | The company is a dormant relevant company whose directors are exempt under s 201A from preparing financial statements. |

Consequences for the form:

- The live form's path "Does all shareholder(s) agree to dispense with AGM?" followed by "we will prepare the written resolutions" is unlawful and is removed.
- By the owner's decision the form does not deal with route (a) at all. This loses nothing in practice: a company with a dispensation in force must still send its financial statements within 5 months (s 203(1)(b)), so it also meets route (b).
- A private company that meets neither route (b) nor route (c) must hold its AGM.
- The live form offers route (b) to every company type. It must be limited to private companies.

Safeguards:

- Any member may require an AGM by notice not later than 14 days before the date the AGM would have been due (s 175A(4)). This applies to every route.
- Under route (b), any member or the auditor may, within 14 days after the financial statements were sent, require a general meeting to lay them; the directors must convene it within 14 days of the notice (s 203(4A), (6)).

**Matters normally dealt with at the AGM.** Where no AGM is held, anything the Act requires to be done at an AGM is done by written resolution instead (s 175A(10)(a)). The firm therefore needs the same instructions (directors' re-election, auditors, fees, dividends) whether or not an AGM is held. The live form asks for them only when an AGM is held.

**Annual return timing without an AGM.** Under routes (a) and (b) the return is lodged after the financial statements have been sent; under route (c), after FYE (s 175A(10)(c)). The date sent is therefore needed for filing.

### 2.3 Financial statements

Preparing and filing are separate duties, and the live form merges them:

| Company | Prepare | File with ACRA |
|---------|---------|----------------|
| Dormant relevant company exempt under s 201A | No | No |
| Solvent exempt private company | Yes | No (S3) |
| Insolvent exempt private company | Yes | Yes |
| Every other company | Yes | Yes |

Dormant relevant company (s 201A): dormant since formation or since the end of the previous financial year; not listed and not a subsidiary of a listed company; total assets (consolidated, if a parent) not above S$500,000 at any time in the year. The directors lodge with the annual return a statement that the company has been dormant, that no notice requiring financial statements has been received, and that accounting records have been kept (s 201A(2)(b)). A dormant company's audit exemption needs a similar statement (s 205B(4)(d)).

A company is dormant while no accounting transaction occurs. Section 205B(3) disregards: shares taken by subscribers, appointing a secretary or auditor, maintaining a registered office, keeping registers and books, and fees, penalties or composition sums payable under written law.

The directors' statement is "signed on behalf of the directors by 2 directors" (s 201(16)). ACRA accepts one signature where the company has a sole director (S3).

### 2.4 Changes from 20 October 2026 (S1, S3)

1. **CEO question.** The annual return asks the filer to answer yes "if the company has any individuals who perform the role of a CEO", and the CEO must then be shown as a position holder. A CEO's appointment must be notified to ACRA within 14 days (CA s 173A(1)(a)).
2. **Confirmation of particulars.** The filer confirms that the latest particulars given to ACRA are accurate for directors, CEOs, secretaries, auditors and members: names, identification details, nationality, contact address, appointment dates, registered office address and shareholding details.
3. **Companies limited by guarantee** confirm the total number of members last given to ACRA.

## 3. Faults in the live form and their fixes

| # | Live form | Fix |
|---|-----------|-----|
| 1 | `agm_dispense`, `agm_dispense_msg` and the stop block `untitled_field_2` offer dispensation by written resolution. | Remove all three. |
| 2 | The FAQ entry on dispensing, the FAQ entry on sole director companies and the `agm_options` tip describe dispensing with AGMs. | Remove the FAQ entry on dispensing and the other references (section 4.4). |
| 3 | `date_of_financial_statement` appears only in the dispensation branch. | Ask it whenever the financial statements are ready. |
| 4 | `date_fs_circulation` is limited to 2026-01-01 to 2026-09-30, and `agm_date` to 2026-10-31, by fixed dates. | Derive from `financial_year_end` (section 4.3). |
| 5 | `financial_year_end` is optional although every deadline depends on it. | Required. |
| 6 | The circulation exemption is offered to public companies. | Private company types only. |
| 7 | A solvent exempt private company is told no financial statement is required and is never asked for one, although it must prepare and circulate them. | Separate preparing from filing (section 2.3). |
| 8 | `attachment_fs_ds` and `date_fs_ds` each hide when the other is filled, through mutual `is_empty` conditions; two of the six branches omit the check. | One question, `fs_ready`, shows one or the other. |
| 9 | `agm_member_request_2` tests `company_solvency = 'Dormant'`, which can never be true. | One request question with rebuilt conditions (section 4.5). |
| 10 | The request questions do not mention the auditor. | "Has any member or the auditor asked for an AGM?" |
| 11 | `company_type` lists "Private Company Limited by Guarantee" (companies limited by guarantee are public) and "Private Company Limited by Share" (typo). | Options in section 4.4. |
| 12 | Matters for approval (`agm_agenda`) are collected only when an AGM is held. | Also collect them when no AGM is held, for written resolutions (section 2.2). |
| 13 | `company_solvency` is asked of every company type. | Exempt private companies only. |
| 14 | No audit status, CEO question or confirmation of particulars. | Add (section 4.4). |
| 15 | Apostrophes appear as `???` in the FAQ and help text. | Retype with plain apostrophes. |
| 16 | Stray fields and keys: hidden `untitled_field_2_3`, `untitled_field_3`, `label_fs_ds_copy`, `agm_dispense_msg_copy`. | Drop the hidden field; give the others meaningful keys. |

The `director_statement` tip keeps "signed by two directors" and adds "or by the sole director".

## 4. Phase 1: the revised form

### 4.1 How to build it

Follow the Singapore Company Incorporation form, a guided template with stable keys:

| Piece | File | Notes |
|-------|------|-------|
| Field definitions | `src/lib/form-templates/sg-annual-return-declaration.ts` (new) | Export `SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration'`, version `1`, title "Annual Return Declaration", an `ANNUAL_RETURN_KEYS` constant, `buildSgAnnualReturnDeclarationFields()` and `buildSgAnnualReturnDeclarationSettings()`. Reuse the helper style in `sg-company-incorporation.ts`. |
| Registry | `src/lib/form-templates/index.ts` | Add to `FORM_TEMPLATES`; add `isAnnualReturnDeclarationForm(settings)`. |
| Seed service | `src/services/form-template.service.ts` | Add `seedAnnualReturnDeclarationForm(params)`. Move the shared part of `seedCompanyIncorporationForm` (find the unlocked draft, create or update, write the binding) into one helper instead of copying it. |
| Script | `scripts/seed-annual-return-declaration-form.ts` (new) | Copy `scripts/seed-incorporation-form.ts`. Usage: `npx tsx scripts/seed-annual-return-declaration-form.ts --email <login>`. Add `db:seed-annual-return-declaration` to `package.json`. |
| Month offsets for date rules | `src/lib/validations/form-builder.ts`, `src/services/form-submission/validation.ts`, `src/app/(public)/forms/f/[slug]/_lib/validation.ts`, `src/components/forms/field-validation-tab.tsx`, `src/components/forms/builder-utils.ts` | Section 4.3. |
| Tests | `__tests__/lib/annual-return-declaration-template.test.ts` (new) | Section 4.6. |
| Docs | The forms section of `docs/ARCHITECTURE.md` or `docs/README.md` | One paragraph on the seed and the template. |

A guided template is preferred over a plain form because Phase 2 reads and writes answers by key, the binding locks fields on first publication, and the server can recognise the form without matching its title.

The seed creates a draft, or updates the unpublished draft it seeded earlier. It never changes a published form, so the live form keeps working until staff publish the new one and archive the old one.

**Settings.** When the seed creates the draft, copy `notifications`, `responseTable`, `i18n` and the branding keys from the live form if the workspace has one (slug `annual-return-declaration`). Do not hard-code recipient emails in the repository. Otherwise use: drafts enabled with 30-day deletion, attachment mode `attachments`, summary fields `company_name`, `company_type`, `financial_year_end`. Description: "Declaration form for ACRA annual return filing". Tag: `annual-return`.

**Keys and values.** Keep the live keys wherever the question is unchanged, and keep its style of storing the option label as the value (`Yes`, `No`, `Active`). The new form has its own response table, so old responses are unaffected.

### 4.2 Derived conditions used below

| Name | Meaning |
|------|---------|
| Private | `company_type` is one of the two private options. |
| Exempt dormant | `company_status = Dormant` and both dormant checks are `Yes`. |
| Statements to prepare | Not exempt dormant. |
| Statements to file | Statements to prepare, and not (exempt private type and `Solvent`). |

### 4.3 Date rules that follow the financial year end

Date rules can already be relative to another field, but only in days. Five months is not a fixed number of days, so add `minDateOffsetMonths` and `maxDateOffsetMonths`:

- add both to `fieldValidationSchema`, each requiring its `...DateFieldKey`, range -120 to 120;
- apply them in `resolveRelativeDateBoundary` on the server and on the public page, months first and then days;
- when the source day does not exist in the target month, use the last day of that month (FYE 30 September plus 5 months is 28 or 29 February);
- add the inputs to the builder's validation tab.

| Field | Rule |
|-------|------|
| `financial_year_end` | Required; not after today. |
| `date_of_financial_statement` | On or after `financial_year_end`; not after today. |
| `date_fs_circulation` | On or after `date_of_financial_statement`; not after today; not later than `financial_year_end` plus 5 months. |
| `agm_notice_date` | Unchanged: at least 14 days before `agm_date`. |
| `agm_date` | Unchanged minimum. No fixed maximum, so a company already past its deadline can still propose a date; the tip states the 6-month limit and staff follow up on late dates. |

### 4.4 Field list

"Yes/no" is a required `SINGLE_CHOICE` with values `Yes` and `No`. Fields are required unless marked optional. "Kept" means copy the live field, fixing only what section 3 lists. New fields are marked **New**.

#### FAQ (`commonly_asked_questions`)

Kept, except:

| Entry | Change |
|-------|--------|
| Is my company required to hold an AGM? | "A company must hold an AGM unless it is exempt. A company that is not listed must hold it within 6 months after its financial year-end. Only private companies can be exempt." |
| When is a company exempt from holding an AGM? | "A private company need not hold an AGM for a financial year if (1) it sent its financial statements to all members within 5 months after the financial year-end, or (2) it is dormant, is not listed or a subsidiary of a listed company, and has total assets of $500,000 or less. In either case it must still hold a meeting if a member or the auditor asks for one in time. Matters normally approved at the AGM are then approved by written resolution." |
| What does "dispense with AGM" mean? | Remove. |
| Can a sole director / sole shareholder company hold an AGM? | "Yes. We prepare the AGM documents, or written resolutions where the company is exempt from holding an AGM, for signing." |

#### Part 1: Company information

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `prefill_source` | `HIDDEN` | | **New.** Empty in Phase 1; Phase 2 sets `company_record`. |
| `company_name` | Text | Company Name | Kept. |
| `company_uen` | Text | UEN | **New.** Width 33. |
| `company_type` | Dropdown | Company Type | Options: "Exempt Private Company Limited by Shares", "Private Company Limited by Shares", "Public Company Limited by Shares", "Public Company Limited by Guarantee". Tip kept. "Others" is removed: the form's rules do not fit other entity types. |
| `financial_year_end` | Date | Financial year-end | Now required. |
| `company_status` | Single choice | Company Status | Kept. Add to the tip the transactions that do not count (section 2.3). |
| `company_solvency` | Single choice | Company Solvency | Kept; exempt private type only. |
| `dormant_co_check1`, `dormant_co_check2` | Yes/no | Kept | When Dormant. |
| `dormant_confirm` | Tick box | "The company has been dormant since its formation or the end of the previous financial year, has received no notice requiring financial statements or an audit, and has kept its accounting records." | **New.** When exempt dormant. This is the directors' statement lodged with the annual return. |

#### Part 2: Financial statements (**new** heading)

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `fs_not_required_msg` | Info | "The company is exempt from preparing financial statements." | Exempt dormant. Replaces `label_fs_ds_copy`. |
| `fs_prepare_only_msg` | Info | "The company must prepare financial statements and send them to its members. As a solvent exempt private company it need not file them with ACRA." | **New.** Statements to prepare but not to file. |
| `label_fs_ds` | Info | "The company must prepare financial statements, send them to its members and file them with ACRA." | Statements to file. |
| `fs_ready` | Yes/no | Are the signed financial statements and directors' statement ready? | **New.** Statements to prepare. |
| `attachment_fs_ds` | File upload | Financial statements and directors' statement | If ready. |
| `date_of_financial_statement` | Date | Date of the directors' statement | If ready. Subtext: "The date the directors signed the statement that accompanies the financial statements." |
| `date_fs_ds` | Date | Estimated date of completion | If not ready. Today or later. |
| `fs_audit_status` | Single choice | Are the financial statements audited? | **New.** Statements to prepare. "Audited"; "Not audited (small company exemption)", private types only; "Not audited (dormant company exemption)", Dormant only. |

#### Part 3: AGM matters

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `exemption_check_fs_circulation` | Single choice | Have the financial statements been sent to all members within five months after the financial year-end? | Private, statements to prepare. Options: "Yes"; "Not yet, but they will be sent within five months" (**new**); "No". |
| `date_fs_circulation` | Date | Date the financial statements were sent | If Yes. |
| `agm_member_request` | Yes/no | Has any member or the auditor asked for an AGM? | Replaces `agm_member_request` and `agm_member_request_2`. Shown when an exemption route is met. |
| `agm_exemption_msg` | Info | "The company is exempt from holding an AGM for this financial year." For "Not yet": add "provided the financial statements are sent within five months after the financial year-end". | Route met and no request. |
| `agm_options` | Yes/no | Will the company hold an AGM anyway? | Route met and no request. Tip: "An AGM is due within 6 months after the financial year-end." |
| `label_agm_msg` | Info | "The company is required to hold an AGM." | AGM required. |
| `short_notice_consent`, `agm_notice_date`, `agm_date`, `agm_time`, `proposed_agm_venue` | | Kept | When an AGM will be held. |
| `agm_agenda` | Multiple choice | Matters to be included in AGM agenda | Kept. When an AGM will be held. |
| `resolution_matters` | Multiple choice | Matters to be approved by written resolution | **New.** When no AGM will be held. Optional. Same options as `agm_agenda` without "Receive and adopt the Financial Statement": re-election of directors, election or re-election of auditors, directors' fees, dividends, any other matters, each with the same text inputs. |

#### Part 4: Directors' statement

`director_statement`, `director_statement_consent` and their two messages are kept unchanged, with keys `director_statement_consent_msg` and `director_statement_consent_block` in place of `agm_dispense_msg_copy` and `untitled_field_3`. Show this part only when there are statements to prepare.

#### Part 5: CEO and company particulars (**new**)

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `ceo_exists` | Yes/no | Does any individual perform the role of chief executive officer of the company? | Tip: "ACRA asks this in every annual return from 20 October 2026. It is about the role performed, not the job title." |
| `ceo_details` | Long text | Name of the CEO and date of appointment | If Yes. |
| `particulars_accurate` | Yes/no | Are ACRA's records of the company's directors, CEO, secretary, auditor, shareholders and registered office accurate? | Tip: "ACRA requires this confirmation in every annual return from 20 October 2026. Check against the company's business profile." |
| `particulars_changes` | Long text | What needs to be updated? | If No. |
| `guarantee_member_count` | Number | Total number of members | Public Company Limited by Guarantee only. |

#### Declaration

`declaration_text`, `sign`, `sign_full_name` and `sign_date` are kept.

### 4.5 AGM logic

| Situation | Outcome |
|-----------|---------|
| Public company type | AGM required. No exemption questions. |
| Private, exempt dormant | Route met. |
| Private, statements sent within five months ("Yes" or "Not yet, but they will be") | Route met. |
| Private, statements not sent within five months, not exempt dormant | AGM required. |
| Route met, a member or the auditor asked for an AGM | AGM required. |
| Route met, no request | Exempt; the company may still choose to hold an AGM. |
| AGM required, or the company chooses to hold one | Show notice, date, time, venue and agenda. |
| No AGM | Show `resolution_matters`. |

### 4.6 Tests

- The built fields pass `saveFormFieldsSchema`, keys are unique and every condition refers to an existing key (model: the CDD test in `__tests__/lib/corp-sec-templates.test.ts`).
- Each row of section 4.5 and of the table in section 2.3, using `evaluateCondition` and `validateRequiredPublicAnswers`.
- No field, option or text mentions dispensing with an AGM.
- Month offsets: 5 months from 30 September, 31 August and 31 March; leap year; server and client agree.
- The seed creates a draft, updates an unlocked draft, creates a new draft beside a published form, and copies settings from the live form when present.
- Run `npm run typecheck`, `npm run lint` and the form suites.

## 5. Phase 2: fill the form from the company record

### 5.1 What exists today

| Finding | Where |
|---------|-------|
| Public forms take no company context. The page reads only `lang`, `draft`, `resume`, `embed` and `preview` from the URL. | `src/app/(public)/forms/f/[slug]/page.tsx` |
| Drafts are stored server-side and reopened by a link carrying a code and a secret token. Staff can already generate a resume link for a draft. | `src/services/form-draft.service.ts` (`createFormDraftRecord`, `generateFormDraftResumeLink`) |
| Submissions and drafts have no company column; both have a JSON `metadata`. | `FormSubmission`, `FormDraft` in `prisma/schema.prisma` |
| Saving a draft from the browser rebuilds its metadata from an allow-list, so unknown keys are dropped. | `normalizeDraftMetadata` |
| Repeat sections store one array per field key, with row counts in `metadata.repeatSectionCounts`. | `validateRequiredRepeatRows`, `normalizeDraftMetadata` |
| A staff-only review stored in submission metadata already exists for incorporation. | `src/lib/forms/company-incorporation-review.ts`, `/api/forms/[id]/responses/[submissionId]/incorporation-review` |
| The form engine has no notion of a prefilled value, so nothing can show that a value was edited. | New work, section 5.5 |

### 5.2 Approach: a prefilled draft per company

Staff choose a company. The server creates a draft of the published ARD form with the company's records in it and returns the resume link for staff to send. This reuses the draft and resume mechanism: the public page needs no new data endpoint, and no company data is reachable without the draft's secret token.

Alternatives rejected: a company token in the URL with a public endpoint returning company data (new public surface for personal data), and a client portal login (far larger build).

### 5.3 Data mapping

All values come from `getCompanyFullDetails` (`src/services/company.service.ts`). Build the mapping as a pure function, `buildAnnualReturnPrefill(company)`, in `src/lib/forms/annual-return-prefill.ts`.

| Form field | Source | Notes |
|------------|--------|-------|
| `company_uen` | `Company.uen` | |
| `company_name` | `Company.name` | |
| `company_type` | `Company.entityType` | Maps `EXEMPTED_PRIVATE_LIMITED`, `PRIVATE_LIMITED`, `PUBLIC_LIMITED` and `PUBLIC_COMPANY_LIMITED_BY_GUARANTEE` to the four options. Refuse to prefill for any other type. |
| `record_entity_status` | `Company.status` | Display label. This is the registry status, not the Active or Dormant answer, which the client still gives. |
| `record_primary_activity`, `record_secondary_activity` | SSIC code and description pairs | |
| `record_registered_office` | `CompanyAddress` where `addressType = REGISTERED_OFFICE` and `isCurrent` | `fullAddress`. |
| Position holder rows | `CompanyOfficer` where `isCurrent` | Role, name, identification number, nationality, address, appointment date. Includes CEO rows. |
| Auditor | `CompanyAuditor` | Shown as a position holder row with role Auditor. |
| Share capital rows | `ShareCapital` | Share class, currency, number of shares, amount, paid up or not. |
| Shareholder rows | `CompanyShareholder` where `isCurrent` | Name, identification number, address, share class, number of shares. |
| `financial_year_end` | `financialYearEndDay`, `financialYearEndMonth`, `fyeAsAtLastAr`, `CompanyFinancialPeriod` | Suggest the year end after `fyeAsAtLastAr`. |

Identification numbers and addresses are shown in full. Reuse the existing display labels for entity type, status and officer role (`src/services/bizfile/canonical-values.ts`, company detail components).

### 5.4 Form changes

Add a "Company records" part after Part 1, shown only when `prefill_source = company_record`. Every field is editable.

| Key | Type | Label |
|-----|------|-------|
| `record_as_at` | Info | "From our records as at {date}. Please correct anything that is wrong or out of date; your changes are highlighted." |
| `record_entity_status` | Text | Entity status |
| `record_primary_activity`, `record_secondary_activity` | Text | Primary and secondary business activity |
| `record_registered_office` | Text | Registered office address |
| `officers_section` | Repeat section, at least 1 item | Position holders |
| `officer_record_id` | `HIDDEN` | Source row id; empty for a row the client adds. |
| `officer_role`, `officer_name`, `officer_id_number`, `officer_nationality`, `officer_address`, `officer_appointment_date` | Dropdown, text, date | Position, name, identification number, nationality, address, date of appointment |
| `share_capital_section` | Repeat section | Share capital |
| `capital_record_id` | `HIDDEN` | |
| `capital_class`, `capital_currency`, `capital_shares`, `capital_amount`, `capital_paid_up` | Text, number | Share class, currency, number of shares, issued amount, paid-up amount |
| `shareholders_section` | Repeat section | Shareholders |
| `shareholder_record_id` | `HIDDEN` | |
| `shareholder_name`, `shareholder_id_number`, `shareholder_address`, `shareholder_class`, `shareholder_shares` | Text, number | Name, identification number, address, share class, number of shares |

When prefilled:

- `particulars_accurate` and `particulars_changes` are hidden; the editable records replace them. Add one tick to the declaration, shown only when prefilled: "The company records above, with my changes, are accurate and complete."
- `ceo_details` is hidden; its replacement text under `ceo_exists` reads "If yes, make sure the CEO is listed under position holders above."
- `record_as_at` cannot hold a per-draft date in its text, because field text belongs to the form. Either make it a prefilled read-only text field, or support a `{prefill.createdAt}` placeholder. Choose the first.

Because the template locks on publication, include these fields in version 1 if Phase 2 follows Phase 1 closely; they stay hidden while `prefill_source` is empty. Otherwise they arrive as version 2, a new draft beside the published form.

Confirm before building that `HIDDEN` fields inside a repeat section keep their per-row values through `sanitizePublicAnswers` and `pruneHiddenConditionalAnswers`. If they do not, fix that first; row matching depends on it.

### 5.5 Highlighting edited values

This is new form-engine behaviour and should be generic, not specific to this form.

1. **Baseline.** A prefilled draft stores the prefilled answers as a baseline under a server-owned metadata key (for example `__oak_prefill`: `companyId`, `companyAggregateRevision`, `createdAt`, `createdById`, `baseline`). The browser never writes this key.
2. **Public page.** The draft resume response includes the baseline answers (not `companyId`). A field whose current value differs from its baseline gets the edited background; if the client restores the value, the colour reverts. Compare after trimming and normalising case-insensitive whitespace only; do not treat an empty baseline as "edited" when the field is still empty.
3. **Repeat rows.** Match rows to the baseline by the hidden record id, not by position, because removing a row shifts positions. A row with no record id was added by the client and is highlighted as a whole. For removed baseline rows, show a line under the section: "Removed: {name}", with an Undo action.
4. **Colour.** Take the edited background from `docs/guides/DESIGN_GUIDELINE.md`; do not reuse the grey used for read-only fields. Add a text cue for screen readers and colour-blind users, such as an "Edited" label or a title giving the original value.
5. **After submission.** The server computes the differences (changed fields, added rows, removed rows) from the stored baseline and saves them with the submission. Use the same highlight in the staff response view and the response PDF.

### 5.6 Server work

1. **Create the draft.** Add `createPrefilledFormDraft(formId, answers, serverMetadata, params)` to `form-draft.service.ts`, wrapping `createFormDraftRecord`. It requires a published form with drafts enabled.
2. **Keep server-owned metadata.** `savePublicDraft` replaces metadata on every save. Carry `__oak_prefill` forward the way the resume token is carried, and never accept it from the browser.
3. **Protect the keys that identify the source.** On each save and on submission, restore `prefill_source` and reject record ids that are not in the baseline.
4. **Link the submission.** In `createPublicSubmission`, when the active draft has `__oak_prefill`, copy `companyId`, the baseline and the computed differences to `FormSubmission.metadata` server-side. Check that `sanitizeSubmissionMetadata` cannot be used to forge or drop them.
5. **Staff API.** `POST /api/forms/[id]/prefilled-drafts` with `{ companyId }` returns the resume link. Require form access and read access to that company, scope every query by tenant, and write an audit log entry (`docs/guides/RBAC_GUIDELINE.md`, `AUDIT_LOGGING.md`).
6. **Staff screens.** A "Send annual return declaration" action on the company page that creates the draft and shows the link to copy. On the response page, a panel listing the differences from the company record and whether the record has changed since the snapshot (`aggregateRevision`).
7. **No automatic updates.** Edits go to staff, who update the company record through the usual company and BizFile flows.

### 5.7 Privacy and data quality

- The resume link is a bearer secret. Anyone holding it sees full identification numbers and addresses until the draft expires (30 days by default). The owner has accepted this.
- The snapshot is only as current as the company record. Have the send action warn staff when the record has no recent BizFile or ACRA sync.
- The baseline stored on the submission is the evidence of what the client was shown. Keep it unchanged after submission.

### 5.8 Tests

- `buildAnnualReturnPrefill`: each mapping row, ceased officers and former shareholders excluded, unsupported entity type refused.
- Draft service: server metadata survives a public save; the browser cannot write the baseline; `prefill_source` is restored if altered.
- Highlighting: changed, restored, added row, removed row and Undo, in the browser test suite.
- Submission: `companyId`, baseline and differences are saved; a browser-supplied `companyId` is ignored.
- API: a user without access to the company is refused; another tenant's company is not found.
- PostgreSQL suites and browser tests run as described in `CLAUDE.md`.

## 6. Order of work

1. Month offsets for date rules (section 4.3), with tests.
2. Phase 1: template file, registry entry, seed service, script, tests, docs.
3. Staff review the seeded draft in the builder, publish it, archive the live form.
4. Phase 2: prefill function, draft service changes, edited-value highlighting, submission link, API, staff screens.
