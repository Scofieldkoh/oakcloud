# Annual Return Declaration form: revised seed and company-record prefill

Handover plan, written 2026-11-14. Nothing in this plan has been built.

- **Phase 1** seeds a revised Annual Return Declaration (ARD) form, based on the live form, that corrects the AGM dispensation logic, captures the date and circulation of the financial statements, and adds ACRA's 20 October 2026 questions.
- **Phase 2** lets staff send the form for a specific company with its Oakcloud records filled in, so the client confirms them.

## 1. Read this first

### 1.1 The base form

The live form is "Annual Return Declaration" (slug `annual-return-declaration`, published, 42 fields, one page in three parts plus a declaration). It is not in the repository; the owner supplied an export of its configuration on 2026-11-14 and section 4 is written against that export. The export is not committed because its settings contain staff email addresses.

The form is forward-looking: a director completes it before the AGM and the filing, and the firm uses the answers to prepare the AGM notice, minutes, resolutions and the annual return. Keep that purpose. Questions about the AGM ask for proposed dates, not past ones.

### 1.2 Decisions the owner still has to make

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Whether the form recognises a dispensation resolution that is already in force, and offers "dispense with future AGMs" as an AGM agenda item (section 3.2). | Yes to both. Without the first, a company that has validly dispensed would be told it must hold an AGM. |
| D2 | How much personal data the prefilled form shows (section 5.6). | Mask identification numbers, show addresses. |
| D3 | Whether Phase 2 shows officers and shareholders as read-only text or as a new table field (section 5.4). | Read-only text first. |
| D4 | Whether the question on shareholder consent to omit directors' interests stays as it is (section 4.2, item 12). | Keep it unchanged until its legal basis is checked. |

### 1.3 What could not be verified

Singapore Statutes Online refused automated requests (HTTP 403). Sections 175A(1) and (2) and 184A(1) and (2) of the Companies Act were supplied by the owner and are quoted in section 3.2. Every other section reference is from memory and marked "verify". The rules outside those sections come from ACRA's own pages, read on 2026-11-14.

## 2. Sources

| Ref | Page | Last updated |
|-----|------|--------------|
| S1 | [ACRA: Commencement of key changes on 20 October 2026](https://www.acra.gov.sg/news-events/news-announcements/commencement-of-key-changes-under-the-corporate-and-accounting-laws--amendment--act-2025-on-20-october-2026/) | Published 6 Oct 2026 |
| S2 | [ACRA: AGM due dates and requirements](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/holding-annual-general-meetings/due-dates-requirements/) | 11 Feb 2026 |
| S3 | [ACRA: Steps to file an annual return](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/steps-to-file/) | 19 Oct 2026 |
| S4 | [ACRA: Annual return deadlines](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/filing-annual-returns-companies/deadline-requirements/) | 14 May 2026 |
| S5 | [ACRA: Audit exemptions, small company concept](https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/preparing-financial-statements/audit-exemptions/) | Not read this session; verify the thresholds |
| S6 | [Companies Act 1967](https://sso.agc.gov.sg/Act/CoA1967), sections 175A and 184A | Text supplied by the owner |

## 3. Requirements the form must reflect

### 3.1 Deadlines (S2, S4)

| Company | AGM | Annual return |
|---------|-----|---------------|
| Listed | Within 4 months after the financial year end (FYE) | Within 5 months after FYE |
| Not listed | Within 6 months after FYE | Within 7 months after FYE |

Companies with a share capital that keep an overseas branch register get one more month for the annual return. These match the existing deadline rules in `src/services/compliance-monitoring/catalog.ts`.

### 3.2 When a company need not hold an AGM (S6)

Section 175A(1): a company need not hold an AGM for a financial year

- (a) "if it is a private company in respect of which there is in force a resolution passed in accordance with subsection (2) to dispense with the holding of annual general meetings";
- (b) if, at the end of that financial year, it is a private company and has sent the section 203(1) documents (the financial statements) to all persons entitled to receive notice of general meetings within the period in section 203(1)(b) (5 months after FYE per S2; verify the section);
- (c) if, at the end of that financial year, it is both a private company and a dormant relevant company whose directors are exempt under section 201A from preparing financial statements.

Section 175A(2): the dispensation resolution "is only treated as passed at a general meeting if it has been passed by all of such members as, being entitled to do so, vote in person or, where proxies are allowed, by proxy present at the meeting".

Section 184A(2): passing resolutions by written means "does not apply to a resolution mentioned in section 175A(1)(a)".

**What this means for the form:**

- A dispensation resolution must be passed at a general meeting. It cannot be passed by written resolution.
- The live form does the opposite. When the financial statements were not circulated in time it asks "Does all shareholder(s) agree to dispense with AGM?" and promises to prepare "the written resolutions for all the shareholder(s) to sign". That path must go.
- A company cannot dispense with the current year's AGM without holding a general meeting. A company that missed the 5-month circulation window, has no resolution in force and is not an exempt dormant company must therefore hold its AGM.
- A resolution passed at an earlier general meeting and still in force does exempt the company (route a). The form should ask about it (decision D1).
- A company holding an AGM this year can put "dispense with future AGMs" on the agenda. Passed by all members who vote, it applies to later years (decision D1).
- All three routes are open to private companies only. The live form offers the circulation route to every company type.

Safeguards that apply even when a route is met (S2; verify the subsections of 175A):

- A member may ask for an AGM up to 14 days before the end of the sixth month after FYE. The company must then hold it within 6 months after FYE.
- A member or the auditor may ask for a general meeting within 14 days of receiving the financial statements. The company must hold it within 14 days of the request.

Verify on S6: whether the financial statements must still be sent within 5 months after FYE when route (a) applies. The form asks for the circulation date in that case too.

### 3.3 Financial statements (S3)

Preparing and filing are separate duties, and the live form merges them:

| Company | Prepare financial statements | File them with ACRA |
|---------|------------------------------|---------------------|
| Dormant relevant company (not listed, not a subsidiary of a listed company, total assets S$500,000 or less) | No | No |
| Solvent exempt private company | Yes | No |
| Insolvent exempt private company | Yes | Yes |
| Every other company | Yes | Yes |

The annual return asks for the financial period, dormancy, audit status, an exempt private company's solvency, and either the AGM date or the date the financial statements were sent to members (S3). One director signs the directors' statement if the company has a sole director; otherwise at least two sign (S3).

Small company audit exemption (S5, verify): a private company qualifies if it meets two of three tests for the two preceding financial years: revenue of S$10 million or less, total assets of S$10 million or less, 50 employees or fewer. A company in a group also needs the whole group to qualify as a small group.

### 3.4 Changes from 20 October 2026 (S1, S3)

1. **CEO question.** The annual return asks whether any individual performs the role of chief executive officer. ACRA's filing guide says to answer yes "if the company has any individuals who perform the role of a CEO", and that the CEO must then be appointed and shown as a position holder. The test is the role performed, not the job title.
2. **Confirmation of particulars.** The filer confirms that the latest particulars given to ACRA are accurate for directors, CEOs, secretaries, auditors and members. S1 lists names, identification details, nationality, contact address, appointment dates, registered office address and shareholding details.
3. **Companies limited by guarantee** confirm the total number of members last given to ACRA.
4. **Registered office.** Minimum public opening hours are abolished. A company must still make records available for inspection on reasonable notice, for at least two hours on each relevant business day.

ACRA has not published the exact wording of the new declarations. Verify on S6: the definition of "chief executive officer" in section 4 (from memory: a person, by whatever name described, who is employed by or acts for the company and is principally responsible for the management and conduct of its business) and the 14-day period for notifying ACRA of a CEO's appointment.

## 4. Phase 1: the revised form

### 4.1 How to build it

Follow the Singapore Company Incorporation form, which is a guided template with stable keys:

| Piece | File | Notes |
|-------|------|-------|
| Field definitions | `src/lib/form-templates/sg-annual-return-declaration.ts` (new) | Export `SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration'`, version `1`, title "Annual Return Declaration", an `ANNUAL_RETURN_KEYS` constant, `buildSgAnnualReturnDeclarationFields()` and `buildSgAnnualReturnDeclarationSettings()`. Reuse the helper style in `sg-company-incorporation.ts` (`heading`, `info`, `requirements`, `eq`, `all`, `any`). |
| Registry | `src/lib/form-templates/index.ts` | Add to `FORM_TEMPLATES`; add `isAnnualReturnDeclarationForm(settings)`. |
| Seed service | `src/services/form-template.service.ts` | Add `seedAnnualReturnDeclarationForm(params)`. Move the shared part of `seedCompanyIncorporationForm` (find the unlocked draft, create or update, write the binding) into one helper instead of copying it. |
| Script | `scripts/seed-annual-return-declaration-form.ts` (new) | Copy `scripts/seed-incorporation-form.ts`. Usage: `npx tsx scripts/seed-annual-return-declaration-form.ts --email <login>`. Add `db:seed-annual-return-declaration` to `package.json`. |
| Month offsets for date rules | `src/lib/validations/form-builder.ts`, `src/services/form-submission/validation.ts`, `src/app/(public)/forms/f/[slug]/_lib/validation.ts`, `src/components/forms/field-validation-tab.tsx`, `src/components/forms/builder-utils.ts` | See section 4.3. |
| Tests | `__tests__/lib/annual-return-declaration-template.test.ts` (new) | See section 4.6. |
| Docs | The forms section of `docs/ARCHITECTURE.md` or `docs/README.md` | One paragraph on the seed and the template. |

A guided template is preferred over a plain form because Phase 2 reads and writes answers by key, the binding locks fields on first publication, and the server can recognise the form without matching its title.

The seed creates a draft, or updates the unpublished draft it seeded earlier. It never changes a published form, so the live form keeps working until staff publish the new one and archive the old one.

**Settings.** When the seed creates the draft, copy `notifications`, `responseTable`, `i18n` and the branding keys from the live form if the workspace has one (slug `annual-return-declaration`). Do not hard-code recipient emails in the repository. Otherwise use: drafts enabled with 30-day deletion, notification attachment mode `attachments`, response table summary fields `company_name`, `company_type`, `financial_year_end`. Set the description to "Declaration form for ACRA annual return filing" and the tag to `annual-return`.

**Keys and values.** Keep the live keys wherever the question is unchanged, and keep its style of storing the option label as the value (`Yes`, `No`, `Active`). The new form is a separate form with its own response table, so old responses are unaffected by any change here.

### 4.2 Faults in the live form and their fixes

| # | Live form | Fix |
|---|-----------|-----|
| 1 | `agm_dispense` ("Does all shareholder(s) agree to dispense with AGM?"), `agm_dispense_msg` (promises written resolutions) and `untitled_field_2` (stop block). | Remove all three. See section 3.2. |
| 2 | FAQ "What does 'dispense with AGM' mean?", the FAQ on sole director companies and the `agm_options` tip say AGMs can be dispensed with by resolution of all members, without saying it must be at a general meeting. | Reword per section 4.4. |
| 3 | `date_of_financial_statement` appears only in the dispensation branch. | Ask it whenever the financial statements are ready. |
| 4 | `date_fs_circulation` is limited to 2026-01-01 to 2026-09-30, and `agm_date` to 2026-10-31, by fixed dates. | Derive both from `financial_year_end` (section 4.3). |
| 5 | `financial_year_end` is optional although every deadline depends on it. | Required. |
| 6 | The circulation exemption (`exemption_check_fs_circulation`) is offered to public companies. | Private company types only. |
| 7 | The "Financial Statement required" and "not required" messages merge preparing with filing. A solvent exempt private company is told nothing is required and is never asked for its financial statements, although it must prepare and circulate them. | Separate the two duties (section 3.3). Ask for the financial statements whenever they must be prepared. |
| 8 | `attachment_fs_ds` and `date_fs_ds` each hide when the other is filled, through mutual `is_empty` conditions; two of the six branches omit the check. | Replace with one question, `fs_ready`, that shows one or the other. |
| 9 | `agm_member_request_2` tests `company_solvency = 'Dormant'`, which can never be true (the values are Solvent and Insolvent). | Rebuild the AGM conditions from the table in section 4.5. |
| 10 | The member request questions do not mention the auditor. | "Has any member or the auditor asked for an AGM?" |
| 11 | `company_type` lists "Private Company Limited by Guarantee" (companies limited by guarantee are public) and "Private Company Limited by Share" (typo). | Options in section 4.4. |
| 12 | `director_statement` help text says the directors' statement "must be signed by two directors". | "Signed by two directors, or by the sole director." The consent question `director_statement_consent` and its two messages stay unchanged pending decision D4; S3 shows Bizfile offering an "Obtained ACRA approval" answer here, which the form does not. |
| 13 | `company_solvency` is asked of every company type. | Exempt private companies only; it has no effect for the others. |
| 14 | No audit question, although the annual return and the AGM agenda need it. | Add `fs_audit_status`. |
| 15 | No UEN, no contact email, no CEO question, no confirmation of particulars. | Add (section 4.4). |
| 16 | Apostrophes appear as `???` in the FAQ and help text. | Retype the text with plain apostrophes. |
| 17 | Stray fields and keys: hidden `untitled_field_2_3`, `untitled_field_3`, `label_fs_ds_copy`, `agm_dispense_msg_copy`. | Drop the hidden field; give the others meaningful keys. |

### 4.3 Date rules that follow the financial year end

Date rules can already be relative to another field, but only in days (`minDateOffsetDays`, `maxDateOffsetDays`). Five and six months are not a fixed number of days, so add `minDateOffsetMonths` and `maxDateOffsetMonths`:

- add both to `fieldValidationSchema`, each requiring its `...DateFieldKey`, range -120 to 120;
- apply them in `resolveRelativeDateBoundary` on the server and on the public page, months first and then days;
- when the source day does not exist in the target month, use the last day of that month (FYE 30 September plus 5 months is 28 or 29 February);
- add the inputs to the builder's validation tab;
- test month-end cases and leap years on both sides.

| Field | Rule |
|-------|------|
| `financial_year_end` | Required. |
| `date_of_financial_statement` | On or after `financial_year_end`; not after today. |
| `date_fs_circulation` | On or after `date_of_financial_statement`; not after today; not later than `financial_year_end` plus 5 months. |
| `date_fs_circulation_planned` | Today or later; not later than `financial_year_end` plus 5 months. |
| `agm_notice_date` | Unchanged: at least 14 days before `agm_date`. |
| `agm_date` | Unchanged minimum (14 days after `agm_notice_date`). No fixed maximum: a company past its deadline must still be able to propose a date. The help text states the 6-month limit (4 months if listed), and staff follow up on late dates. |

### 4.4 Field list

"Yes/no" is a required `SINGLE_CHOICE` with values `Yes` and `No`. Fields are required unless marked optional. "Kept" means copy the live field unchanged apart from the fixes in section 4.2.

#### FAQ (`commonly_asked_questions`)

Kept, with these answers replaced:

| Question | New answer |
|----------|------------|
| Is my company required to hold an AGM? | "A company must hold an AGM unless it is exempt. A company that is not listed must hold it within 6 months after its financial year-end; a listed company within 4 months. Only private companies can be exempt." |
| When is a company exempt from holding an AGM? | "A private company need not hold an AGM for a financial year if any one of these applies: (1) it sent its financial statements to all members within 5 months after the financial year-end; (2) it is dormant, is not listed or a subsidiary of a listed company, has total assets of $500,000 or less, and is exempt from preparing financial statements; (3) a resolution to dispense with AGMs is in force. In each case the company must still hold a meeting if a member or the auditor asks for one in time." |
| What does "dispense with AGM" mean? | "The members of a private company can resolve to stop holding AGMs. The resolution must be passed at a general meeting, by every member who votes at it. It cannot be passed by written resolution. A company therefore cannot dispense with this year's AGM just by collecting signatures; it can pass the resolution at this year's AGM so that later years are covered." |
| Can a sole director / sole shareholder company hold an AGM? | "Yes. We prepare the AGM documents for the sole shareholder to sign as a record of the meeting." Remove the reference to documents to dispense with the AGM. |

#### Part 1: Company information

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `prefill_source` | `HIDDEN` | | New. Empty in Phase 1; Phase 2 sets `company_record`. |
| `company_name` | Text | Company Name | Kept. |
| `company_uen` | Text | UEN | New. Width 33. |
| `company_type` | Dropdown | Company Type | Options: "Exempt Private Company Limited by Shares", "Private Company Limited by Shares", "Public Company Limited by Shares", "Public Company Limited by Guarantee". Tip kept. "Others" is removed: the form's rules do not fit other entity types. |
| `company_listed` | Yes/no | Is the company listed, or a subsidiary of a listed company? | New. Public types only. Drives the 4-month AGM note. |
| `financial_year_end` | Date | Financial year-end | Now required. Not after today. |
| `company_status` | Single choice | Company Status | Kept (Active, Dormant) with its tip. |
| `company_solvency` | Single choice | Company Solvency | Kept; shown only for the exempt private type. |
| `dormant_co_check1`, `dormant_co_check2` | Yes/no | Kept | Shown when Dormant. |
| `contact_email` | Email | Email for queries on this form | New. Width 50. |

#### Part 2: Financial statements (new heading; the live form has no separate part)

Define "statements to prepare" as: not (Dormant and both dormant checks are Yes). Define "statements to file" as: statements to prepare, and not (exempt private type and Solvent).

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `fs_not_required_msg` | Info | "The company is exempt from preparing financial statements." | When there are no statements to prepare. Replaces `label_fs_ds_copy`. |
| `fs_prepare_only_msg` | Info | "The company must prepare financial statements and send them to its members. As a solvent exempt private company it need not file them with ACRA." | Statements to prepare but not to file. |
| `label_fs_ds` | Info | "The company must prepare financial statements, send them to its members and file them with ACRA." | Statements to file. |
| `fs_ready` | Yes/no | Are the signed financial statements and directors' statement ready? | Statements to prepare. |
| `attachment_fs_ds` | File upload | Financial statements and directors' statement | If ready. Multiple files. |
| `date_of_financial_statement` | Date | Date of the directors' statement | If ready. Subtext: "The date the directors signed the statement that accompanies the financial statements." Rules in 4.3. |
| `date_fs_ds` | Date | Estimated date of completion | If not ready. Today or later. |
| `fs_audit_status` | Single choice | Are the financial statements audited? | Statements to prepare. "Audited"; "Not audited: small company exemption" (private types); "Not audited: dormant company exemption" (Dormant). Tip gives the tests in section 3.3. |
| `auditor_name` | Text | Audit firm | If audited. |

#### Part 3: AGM matters

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `agm_dispensation_in_force` | Yes/no | Is a resolution to dispense with AGMs in force? | New (D1). Private types. Tip: "Answer Yes only if the members passed the resolution at a general meeting and it has not been revoked. A written resolution does not count." |
| `agm_dispensation_date` | Date | Date of the general meeting that passed it | If Yes. Not after today. |
| `exemption_check_fs_circulation` | Single choice | Have the financial statements been sent to all members within five months after the financial year-end? | Private types with statements to prepare. Options: "Yes"; "Not yet, but they will be sent within five months"; "No". |
| `date_fs_circulation` | Date | Date the financial statements were sent | If Yes. Rules in 4.3. |
| `fs_circulation_method` | Multiple choice | How they were sent | If Yes. Email, Post, By hand, Other (with text). |
| `date_fs_circulation_planned` | Date | Date the financial statements will be sent | If "Not yet". Rules in 4.3. |
| `agm_member_request` | Yes/no | Has any member or the auditor asked for an AGM? | One field replaces `agm_member_request` and `agm_member_request_2`. Shown whenever an exemption route is met (section 4.5). |
| `agm_exemption_msg` | Info | "The company is exempt from holding an AGM for this financial year." | Exempt and no request. |
| `agm_options` | Yes/no | Will the company hold an AGM anyway? | Exempt and no request. Replaces the live tip with: "An AGM is due within 6 months after the financial year-end (4 months for a listed company)." |
| `label_agm_msg` | Info | "The company is required to hold an AGM." Add one sentence saying why: a meeting was requested; or the company is public; or no exemption applies because the financial statements were not sent within five months and no dispensation resolution is in force. | AGM required. Use three blocks with separate conditions. |
| `short_notice_consent`, `agm_notice_date`, `agm_date`, `agm_time`, `proposed_agm_venue` | | Kept | Shown when an AGM will be held. |
| `agm_agenda` | Multiple choice | Kept | Add an option (D1), private types only: "Dispense with holding future AGMs", tooltip "Takes effect only if every member who votes at the meeting votes in favour." |

#### Part 4: Directors' statement

`director_statement`, `director_statement_consent` and their two messages are kept, with the help text fix in section 4.2 item 12 and keys `director_statement_consent_msg` and `director_statement_consent_block` in place of `agm_dispense_msg_copy` and `untitled_field_3`. Show this part only when there are statements to prepare.

#### Part 5: CEO and company particulars (new)

| Key | Type | Label | Notes |
|-----|------|-------|-------|
| `ceo_exists` | Yes/no | Does any individual perform the role of chief executive officer of the company? | Tip: "ACRA asks this in every annual return from 20 October 2026. It is about the role, not the title: a managing director or general manager who is principally responsible for running the business counts." |
| `ceo_section` | Repeat section | CEO | If Yes. 1 to 5 items. |
| `ceo_name` | Text | Full name | In the section. |
| `ceo_id_number` | Text | NRIC, FIN or passport number | In the section. Width 50. |
| `ceo_appointment_date` | Date | Date appointed | In the section. Width 50. Not after today. |
| `ceo_is_director` | Yes/no | Is this person also a director? | In the section. |
| `ceo_registered` | Single choice | Is this person registered with ACRA as CEO? | In the section. Yes, No, Not sure. Subtext: "If not, we will file the appointment before the annual return." |
| `particulars_guidance` | Info | "From 20 October 2026 the annual return confirms that ACRA's records of the company's directors, CEO, secretaries, auditors and members are accurate." Link to S1. | |
| `changes_since_last_ar` | Multiple choice | Has any of the following changed without you telling us? | "No changes"; "Directors or secretary (appointment, resignation, name, ID, nationality or address)"; "Auditor"; "Shareholders or shares"; "Registered office address"; "Business activities"; "Registrable controllers"; "Nominee directors or nominee shareholders". |
| `changes_details` | Long text | Describe each change and its date | If anything other than "No changes" is ticked. |
| `changes_conflict_block` | Info, stops progress | "You ticked 'No changes' together with a change. Please untick one." | When "No changes" and any other option are both ticked. |
| `guarantee_member_count` | Number | Total number of members | Public Company Limited by Guarantee only. Whole number, at least 1. |

#### Declaration

`declaration_text`, `sign`, `sign_full_name` and `sign_date` are kept.

### 4.5 AGM logic

| Situation | Outcome |
|-----------|---------|
| Public company type | AGM required. No exemption questions shown. |
| Private, dispensation resolution in force | Exemption route met. |
| Private, dormant with both dormant checks Yes | Exemption route met. |
| Private, statements sent within five months (Yes, or "Not yet, but will be") | Exemption route met. |
| Private, statements not sent within five months, no resolution in force, not exempt dormant | AGM required. |
| Exemption route met, member or auditor asked for an AGM | AGM required. |
| Exemption route met, no request | Exempt; the company may still choose to hold an AGM. |
| AGM required, or the company chooses to hold one | Show notice, date, time, venue and agenda. |

For "Not yet, but they will be sent within five months", add to `agm_exemption_msg`: "This depends on the financial statements being sent by the date you gave."

### 4.6 Tests

- The built fields pass `saveFormFieldsSchema`, keys are unique and every condition refers to an existing key (model: the CDD test in `__tests__/lib/corp-sec-templates.test.ts`).
- Each row of section 4.5 and each row of the table in section 3.3, using `evaluateCondition` and `validateRequiredPublicAnswers`.
- No field, option or text offers dispensing with an AGM by written resolution.
- Month offsets: 5 months from 30 September, 31 August and 31 March; leap year; server and client agree.
- The seed creates a draft, updates an unlocked draft, creates a new draft beside a published form, and copies settings from the live form when present.
- Run `npm run typecheck`, `npm run lint` and the form suites.

### 4.7 Out of scope for Phase 1

- XBRL preparation and the accounting standard questions; staff handle these at filing.
- Locations of the registers of controllers and nominees; staff hold these.
- Any change to the live form or its responses.

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

Staff choose a company and the server creates a draft of the published ARD form with the company's records already in it, then gives staff the resume link to send. This reuses the draft and resume mechanism, so the public page needs no new data endpoint and no company data is reachable without the draft's secret token.

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
| Entity type | `Company.entityType` | Maps `EXEMPTED_PRIVATE_LIMITED`, `PRIVATE_LIMITED`, `PUBLIC_LIMITED` and `PUBLIC_COMPANY_LIMITED_BY_GUARANTEE` to the four `company_type` options. Refuse to prefill for any other type. |
| Entity status | `Company.status` | Display label. Warn staff if not `LIVE`. This is the registry status, not the Active or Dormant answer in `company_status`, which the client still gives. |
| Business activity | `primarySsicCode`, `primarySsicDescription`, and the secondary pair | |
| Registered office | `CompanyAddress` where `addressType = REGISTERED_OFFICE` and `isCurrent` | Use `fullAddress`. |
| Position holders | `CompanyOfficer` where `isCurrent` | Role, name, identification (masked), nationality, address, appointment date. Roles include `CEO`, so the record also shows who is on file as CEO. |
| Auditor | `CompanyAuditor` | Name and appointment date. S1 lists auditors among the particulars to confirm. Also prefill `auditor_name`. |
| Share capital | `ShareCapital` rows, `issuedCapitalAmount`, `paidUpCapitalAmount` and their currencies | Class, currency, number of shares, amount, paid up or not, treasury or not. |
| Shareholders | `CompanyShareholder` where `isCurrent` | Name, type, identification (masked), class, number of shares, percentage, nominee flag. |
| Financial year end | `financialYearEndDay`, `financialYearEndMonth`, `fyeAsAtLastAr`, `CompanyFinancialPeriod` | Suggest `financial_year_end` as the year end after `fyeAsAtLastAr`; leave it editable. |

Display labels for entity type, status and officer role already exist; reuse them (see `src/services/bizfile/canonical-values.ts` and the company detail components) instead of adding new maps.

### 5.4 Form changes

Add a "Company records" part after Part 1, shown only when `prefill_source = company_record`:

| Key | Type | Content |
|-----|------|---------|
| `record_as_at` | Read-only text | Date and time the snapshot was taken. |
| `record_company` | Read-only long text | Entity type, entity status, business activities, registered office. |
| `record_officers` | Read-only long text | One line per position holder, then the auditor. |
| `record_share_capital` | Read-only long text | One line per share class, then issued and paid-up totals. |
| `record_shareholders` | Read-only long text | One line per shareholder. |
| `record_company_correct`, `record_officers_correct`, `record_share_capital_correct`, `record_shareholders_correct` | Yes/no | "Is this accurate and complete?" One under each block. |
| `record_*_corrections` | Long text | "What is wrong or missing?" Shown when the matching answer is No. |

With these in place:

- `company_name`, `company_uen` and `company_type` are read-only when prefilled;
- `changes_since_last_ar` and `changes_details` are hidden when prefilled, because the per-block confirmations replace them;
- the CEO question stays, with a line above it stating who the record shows as CEO, or that it shows none.

Read-only long text is recommended over a new table field type (decision D3) because it needs no change to the form engine, the review step or the PDF. A structured table field with per-row confirmation would read better and could come later. Before committing, check how a read-only `LONG_TEXT` of 20 or more lines looks on the public page and in the PDF.

Because the template locks on publication, include these fields in version 1 if Phase 2 will follow Phase 1 closely; they stay hidden while `prefill_source` is empty. Otherwise they arrive as version 2, a new draft beside the published form.

### 5.5 Server work

1. **Create the draft.** Add `createPrefilledFormDraft(formId, answers, serverMetadata, params)` to `form-draft.service.ts`, wrapping `createFormDraftRecord`. It requires a published form with drafts enabled. Store under one server-owned metadata key (for example `__oak_prefill`): `companyId`, `companyAggregateRevision`, `createdAt`, `createdById` and the snapshot answers.
2. **Keep server-owned metadata.** `savePublicDraft` replaces metadata on every save. Carry `__oak_prefill` forward the way the resume token is carried, strip it in `sanitizeDraftMetadataForClient`, and never accept it from the browser.
3. **Enforce the snapshot.** On each draft save and on submission, overwrite the read-only prefilled keys with the snapshot values. The browser's read-only flag is not a control.
4. **Link the submission.** In `createPublicSubmission`, when the active draft has `__oak_prefill`, copy `companyId` and the snapshot to `FormSubmission.metadata` server-side. Check that `sanitizeSubmissionMetadata` cannot be used to forge or drop it. A `companyId` column on `FormSubmission` would allow indexed lookups from the company page; metadata is enough to start.
5. **Staff API.** `POST /api/forms/[id]/prefilled-drafts` with `{ companyId }` returns the resume link. Require form access and read access to that company, scope every query by tenant, and write an audit log entry (see `docs/guides/RBAC_GUIDELINE.md` and `AUDIT_LOGGING.md`).
6. **Staff screens.** A "Send annual return declaration" action on the company page that creates the draft and shows the link to copy; emailing it can reuse the draft email service. On the response page, an "Annual return check" panel modelled on the incorporation review.
7. **Computed checks in that panel:** circulation date within 5 months after FYE; proposed AGM date within 4 or 6 months; CEO answer against CEO officers on record; each block the client marked inaccurate, with its correction text; whether the company record changed after the snapshot (`aggregateRevision`).
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

1. Get decisions D1 to D4; verify the "verify" items in section 3.
2. Month offsets for date rules (section 4.3), with tests.
3. Phase 1: template file, registry entry, seed service, script, tests, docs.
4. Staff review the seeded draft in the builder, publish it, archive the live form.
5. Phase 2: prefill function, draft service changes, submission link, API, staff screens, review panel.
