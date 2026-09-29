/**
 * Intake profile for the Singapore Company Incorporation form template.
 *
 * Browser-safe: the public review step uses it to list items needing clarification,
 * and the submission service uses it as the authoritative check. `error` issues block
 * submission; `needs_information` and `staff_review` issues are stored with the response
 * for the staff checklist and never block the client from submitting.
 */

import {
  CONSTITUTION,
  CUSTOM_CONSTITUTION_STATUS,
  FY_PERIOD,
  INCORPORATION_KEYS as K,
  MODEL_ADOPTION,
  NAME_STATUS,
  OFFICE_CHOICE,
  PAID_STATUS,
  PARTY_KIND,
  PARTY_ROLE,
  RESIDENT_DIRECTOR,
  SECRETARY_CHOICE,
  SHARE_STRUCTURE,
  SSIC_EXCEPTION,
  TICK,
  YEAR_END_CHOICE,
  YES_NO_CLARIFY,
  CAPITAL_CURRENCIES,
} from '@/lib/form-templates/sg-company-incorporation';
import { decimalUnits, formatDecimalUnits, parseDecimalString } from '@/lib/forms/decimal-string';
import { describeNameCheckAssessment, type NameCheckResultValue } from '@/lib/forms/name-check-result';

export type IncorporationIssueSeverity = 'error' | 'needs_information' | 'staff_review';
export type IncorporationIssueSection = 'company' | 'parties' | 'capital' | 'settings';

export interface IncorporationIssue {
  code: string;
  severity: IncorporationIssueSeverity;
  section: IncorporationIssueSection;
  message: string;
  fieldKey?: string;
  rowIndex?: number;
}

export interface IncorporationParty {
  rowIndex: number;
  kind: string;
  name: string;
  roles: string[];
  ownershipPercent: string | null;
  ownershipUndecided: boolean;
  email: string | null;
  registrationReference: string | null;
}

export interface IncorporationEvaluation {
  issues: IncorporationIssue[];
  parties: IncorporationParty[];
  /** Exact sum of decided percentages, as a decimal string. */
  ownershipTotal: string;
  ownershipFullyDecided: boolean;
}

export interface IncorporationEvaluationOptions {
  nameCheck?: NameCheckResultValue | null;
  /** Codes of the pinned SSIC catalogue. When omitted, membership is not checked. */
  ssicCodes?: ReadonlySet<string> | null;
  /** YYYY-MM-DD in Singapore time; defaults to the current date. */
  today?: string;
}

const PARTY_KEYS = [
  K.partyKind,
  K.partyName,
  K.partyRoles,
  K.ownershipPercent,
  K.ownershipUnsure,
  K.partyEmail,
  K.partyRegistrationReference,
];

const CHOICE_DOMAINS: Record<string, readonly string[]> = {
  [K.nameStatus]: Object.values(NAME_STATUS),
  [K.primarySsicException]: Object.values(SSIC_EXCEPTION),
  [K.capitalPaidStatus]: Object.values(PAID_STATUS),
  [K.capitalCurrency]: CAPITAL_CURRENCIES,
  [K.ownershipArrangement]: Object.values(SHARE_STRUCTURE),
  [K.sharesForOthers]: Object.values(YES_NO_CLARIFY),
  [K.directorsForOthers]: Object.values(YES_NO_CLARIFY),
  [K.otherControl]: Object.values(YES_NO_CLARIFY),
  [K.officeChoice]: Object.values(OFFICE_CHOICE),
  [K.residentDirectorHelp]: Object.values(RESIDENT_DIRECTOR),
  [K.secretaryChoice]: Object.values(SECRETARY_CHOICE),
  [K.yearEndChoice]: Object.values(YEAR_END_CHOICE),
  [K.financialYearPeriod]: Object.values(FY_PERIOD),
  [K.rulesPreference]: Object.values(CONSTITUTION),
  [K.modelAdoptionMode]: Object.values(MODEL_ADOPTION),
  [K.customConstitutionStatus]: Object.values(CUSTOM_CONSTITUTION_STATUS),
};

const ROW_CHOICE_DOMAINS: Record<string, readonly string[]> = {
  [K.partyKind]: Object.values(PARTY_KIND),
  [K.partyRoles]: Object.values(PARTY_ROLE),
  [K.ownershipUnsure]: [TICK],
};

const TICK_KEYS = [K.nameReferenceUnavailable, K.ssicReviewRequested, K.companyEmailUnavailable, K.capitalUnsure, K.officeHoursPending];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function choiceValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (isRecord(value) && typeof value.value === 'string') return value.value.trim();
  return '';
}

function choiceValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = choiceValue(value);
    return single ? [single] : [];
  }
  return value.map(choiceValue).filter(Boolean);
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rowValue(answers: Record<string, unknown>, key: string, rowIndex: number): unknown {
  const value = answers[key];
  return Array.isArray(value) ? value[rowIndex] : undefined;
}

function isTicked(value: unknown): boolean {
  return choiceValues(value).includes(TICK);
}

function isRealIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function addMonthsIso(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

function singaporeToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function timeMinutes(value: unknown): number | null {
  const time = isRecord(value) && typeof value.time === 'string' ? value.time.trim() : typeof value === 'string' ? value.trim() : '';
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function partyLabel(party: Pick<IncorporationParty, 'name' | 'rowIndex'>): string {
  return party.name || `Party ${party.rowIndex + 1}`;
}

function getPartyRowCount(answers: Record<string, unknown>): number {
  let count = 0;
  for (const key of PARTY_KEYS) {
    const value = answers[key];
    if (Array.isArray(value)) count = Math.max(count, value.length);
  }
  return Math.min(count, 50);
}

export function extractIncorporationParties(answers: Record<string, unknown>): IncorporationParty[] {
  const parties: IncorporationParty[] = [];
  const rowCount = getPartyRowCount(answers);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const kind = choiceValue(rowValue(answers, K.partyKind, rowIndex));
    const name = textValue(rowValue(answers, K.partyName, rowIndex));
    const roles = choiceValues(rowValue(answers, K.partyRoles, rowIndex));
    const percentText = textValue(rowValue(answers, K.ownershipPercent, rowIndex));
    const undecided = isTicked(rowValue(answers, K.ownershipUnsure, rowIndex));
    const email = textValue(rowValue(answers, K.partyEmail, rowIndex));
    const registrationReference = textValue(rowValue(answers, K.partyRegistrationReference, rowIndex));

    if (!kind && !name && roles.length === 0 && !percentText && !email && !registrationReference) continue;

    parties.push({
      rowIndex,
      kind,
      name,
      roles,
      ownershipPercent: percentText || null,
      ownershipUndecided: undecided,
      email: email || null,
      registrationReference: registrationReference || null,
    });
  }

  return parties;
}

export function evaluateCompanyIncorporationAnswers(
  answers: Record<string, unknown>,
  options: IncorporationEvaluationOptions = {}
): IncorporationEvaluation {
  const issues: IncorporationIssue[] = [];
  const add = (issue: IncorporationIssue) => issues.push(issue);
  const today = options.today ?? singaporeToday();

  // --- Option membership (direct API payloads) ----------------------------
  for (const [key, domain] of Object.entries(CHOICE_DOMAINS)) {
    const value = choiceValue(answers[key]);
    if (value && !domain.includes(value)) {
      add({ code: 'invalid_option', severity: 'error', section: 'company', fieldKey: key, message: `Select a valid option for ${key.replace(/_/g, ' ')}.` });
    }
  }
  for (const key of TICK_KEYS) {
    const values = choiceValues(answers[key]);
    if (values.some((value) => value !== TICK)) {
      add({ code: 'invalid_option', severity: 'error', section: 'company', fieldKey: key, message: `Select a valid option for ${key.replace(/_/g, ' ')}.` });
    }
  }

  // --- Company name -------------------------------------------------------
  const proposedName = textValue(answers[K.proposedName]);
  const nameCheck = options.nameCheck && options.nameCheck.name === proposedName ? options.nameCheck : null;
  if (proposedName) {
    if (!nameCheck) {
      add({ code: 'name_not_checked', severity: 'staff_review', section: 'company', fieldKey: K.proposedName, message: 'The company name has not been checked yet. Our team will check it.' });
    } else if (nameCheck.assessment !== 'AVAILABLE') {
      add({ code: `name_${nameCheck.assessment.toLowerCase()}`, severity: 'staff_review', section: 'company', fieldKey: K.proposedName, message: describeNameCheckAssessment(nameCheck.assessment).title });
    }
  }

  const nameStatus = choiceValue(answers[K.nameStatus]);
  if (nameStatus === NAME_STATUS.toBeConfirmed) {
    add({ code: 'name_status_unconfirmed', severity: 'needs_information', section: 'company', fieldKey: K.nameStatus, message: 'The name reservation status is to be confirmed.' });
  }
  if ((nameStatus === NAME_STATUS.reserved || nameStatus === NAME_STATUS.pending) && !textValue(answers[K.nameReference])) {
    add({ code: 'name_reference_missing', severity: 'needs_information', section: 'company', fieldKey: K.nameReference, message: 'The ACRA application reference has not been provided.' });
  }

  // --- Business activity --------------------------------------------------
  const primarySsic = choiceValue(answers[K.primarySsic]);
  const secondarySsic = choiceValue(answers[K.secondarySsic]);
  const ssicException = choiceValue(answers[K.primarySsicException]);
  if (ssicException) {
    const reason = textValue(answers[K.primarySsicExceptionReason]);
    if (!reason) {
      add({ code: 'ssic_exception_reason_missing', severity: 'error', section: 'company', fieldKey: K.primarySsicExceptionReason, message: 'Explain why no business activity could be selected.' });
    }
    add({
      code: `ssic_${ssicException}`,
      severity: 'needs_information',
      section: 'company',
      fieldKey: K.primarySsicException,
      message: ssicException === SSIC_EXCEPTION.catalogueUnavailable
        ? 'The business activity list did not load, so no primary activity was selected.'
        : 'No suitable primary business activity was found.',
    });
  } else if (!primarySsic) {
    add({ code: 'ssic_primary_missing', severity: 'error', section: 'company', fieldKey: K.primarySsic, message: 'Select a primary business activity.' });
  }
  if (options.ssicCodes) {
    if (primarySsic && !options.ssicCodes.has(primarySsic)) {
      add({ code: 'ssic_primary_unknown', severity: 'error', section: 'company', fieldKey: K.primarySsic, message: 'Select a primary business activity from the list.' });
    }
    if (secondarySsic && !options.ssicCodes.has(secondarySsic)) {
      add({ code: 'ssic_secondary_unknown', severity: 'error', section: 'company', fieldKey: K.secondarySsic, message: 'Select a secondary business activity from the list.' });
    }
  }
  if (primarySsic && secondarySsic && primarySsic === secondarySsic) {
    add({ code: 'ssic_secondary_duplicate', severity: 'error', section: 'company', fieldKey: K.secondarySsic, message: 'The secondary activity must differ from the primary activity.' });
  }
  if (!textValue(answers[K.businessDescription])) {
    add({ code: 'business_description_missing', severity: 'error', section: 'company', fieldKey: K.businessDescription, message: 'Enter a brief business description.' });
  }
  if (isTicked(answers[K.ssicReviewRequested])) {
    add({ code: 'ssic_review_requested', severity: 'staff_review', section: 'company', fieldKey: K.primarySsic, message: 'Review of the selected activity code was requested.' });
  }

  if (isTicked(answers[K.companyEmailUnavailable])) {
    add({ code: 'company_email_pending', severity: 'needs_information', section: 'company', fieldKey: K.companyEmail, message: 'The company email is not yet established.' });
  }
  const targetDate = textValue(answers[K.targetDate]);
  if (targetDate && !isRealIsoDate(targetDate)) {
    add({ code: 'target_date_invalid', severity: 'error', section: 'company', fieldKey: K.targetDate, message: 'Enter a valid preferred incorporation date.' });
  }

  // --- Parties ------------------------------------------------------------
  const parties = extractIncorporationParties(answers);
  let decidedTotal = BigInt(0);
  const undecidedNames: string[] = [];
  let shareholderCount = 0;
  let directorCount = 0;

  for (const party of parties) {
    const label = partyLabel(party);
    for (const [key, domain] of Object.entries(ROW_CHOICE_DOMAINS)) {
      const values = choiceValues(rowValue(answers, key, party.rowIndex));
      if (values.some((value) => !domain.includes(value))) {
        add({ code: 'invalid_option', severity: 'error', section: 'parties', fieldKey: key, rowIndex: party.rowIndex, message: `${label}: select a valid option.` });
      }
    }
    if (new Set(party.roles).size !== party.roles.length) {
      add({ code: 'party_roles_duplicate', severity: 'error', section: 'parties', fieldKey: K.partyRoles, rowIndex: party.rowIndex, message: `${label}: each role can be selected once.` });
    }

    const isShareholder = party.roles.includes(PARTY_ROLE.shareholder);
    const isDirector = party.roles.includes(PARTY_ROLE.director);
    if (party.kind === PARTY_KIND.organisation && isDirector) {
      add({ code: 'organisation_director', severity: 'error', section: 'parties', fieldKey: K.partyRoles, rowIndex: party.rowIndex, message: `${label}: an organisation can be a shareholder but not a director.` });
    }
    if (isDirector && party.kind !== PARTY_KIND.organisation) directorCount += 1;
    if (!isShareholder) continue;

    shareholderCount += 1;
    if (party.ownershipUndecided) {
      undecidedNames.push(label);
      continue;
    }

    const units = parseDecimalString(party.ownershipPercent);
    if (units === null) {
      add({ code: 'ownership_invalid', severity: 'error', section: 'parties', fieldKey: K.ownershipPercent, rowIndex: party.rowIndex, message: `${label}: enter the shareholding percentage, or tick “Allocation not finalised”.` });
      continue;
    }
    if (units <= BigInt(0) || units > decimalUnits(100)) {
      add({ code: 'ownership_out_of_range', severity: 'error', section: 'parties', fieldKey: K.ownershipPercent, rowIndex: party.rowIndex, message: `${label}: a shareholding must be more than 0% and no more than 100%.` });
      continue;
    }
    decidedTotal += units;
  }

  const ownershipFullyDecided = shareholderCount > 0 && undecidedNames.length === 0;
  const totalText = formatDecimalUnits(decidedTotal);
  if (ownershipFullyDecided && decidedTotal !== decimalUnits(100)) {
    add({ code: 'ownership_total', severity: 'error', section: 'parties', fieldKey: K.ownershipPercent, message: `Ownership percentages total ${totalText}%. They must total 100% when fully allocated.` });
  } else if (!ownershipFullyDecided && decidedTotal > decimalUnits(100)) {
    add({ code: 'ownership_total', severity: 'error', section: 'parties', fieldKey: K.ownershipPercent, message: `Ownership percentages total ${totalText}%, which is more than 100%.` });
  }
  if (undecidedNames.length > 0) {
    add({ code: 'ownership_undecided', severity: 'needs_information', section: 'parties', fieldKey: K.ownershipUnsure, message: `Ownership allocation not finalised for ${undecidedNames.join(', ')}.` });
  }
  if (parties.length > 0 && shareholderCount === 0) {
    add({ code: 'no_shareholder', severity: 'needs_information', section: 'parties', message: 'No shareholder has been added. A company needs at least one shareholder.' });
  }
  if (parties.length > 0 && directorCount === 0) {
    add({ code: 'no_director', severity: 'needs_information', section: 'parties', message: 'No individual director has been added. A company needs at least one director.' });
  }
  if (parties.length === 0) {
    add({ code: 'no_parties', severity: 'error', section: 'parties', message: 'Add at least one shareholder or director.' });
  }

  const seenNames = new Map<string, string>();
  for (const party of parties) {
    const normalized = party.name.toLowerCase().replace(/\s+/g, ' ');
    if (!normalized) continue;
    if (seenNames.has(normalized)) {
      add({ code: 'party_duplicate_name', severity: 'staff_review', section: 'parties', rowIndex: party.rowIndex, message: `${party.name} is listed more than once. Add each person or organisation once and select all their roles.` });
    }
    seenNames.set(normalized, party.name);
  }

  // --- Capital ------------------------------------------------------------
  const capitalUnsure = isTicked(answers[K.capitalUnsure]);
  const capitalUnits = capitalUnsure ? null : parseDecimalString(textValue(answers[K.capitalAmount]));
  if (capitalUnsure) {
    add({ code: 'capital_undecided', severity: 'needs_information', section: 'capital', fieldKey: K.capitalUnsure, message: 'Share capital is not finalised.' });
  } else if (textValue(answers[K.capitalAmount])) {
    if (capitalUnits === null) {
      add({ code: 'capital_invalid', severity: 'error', section: 'capital', fieldKey: K.capitalAmount, message: 'Enter the share capital as an amount, for example 1000.' });
    } else if (capitalUnits <= BigInt(0)) {
      add({ code: 'capital_not_positive', severity: 'error', section: 'capital', fieldKey: K.capitalAmount, message: 'Share capital must be more than zero.' });
    }
  }

  const paidStatus = choiceValue(answers[K.capitalPaidStatus]);
  if (paidStatus === PAID_STATUS.notFinalised) {
    add({ code: 'paid_undecided', severity: 'needs_information', section: 'capital', fieldKey: K.capitalPaidStatus, message: 'Payment of the share capital is not finalised.' });
  }
  if (paidStatus === PAID_STATUS.partially) {
    const paidText = textValue(answers[K.capitalPaidAmount]);
    const paidUnits = parseDecimalString(paidText);
    if (paidText && paidUnits === null) {
      add({ code: 'paid_invalid', severity: 'error', section: 'capital', fieldKey: K.capitalPaidAmount, message: 'Enter the paid-up capital as an amount.' });
    } else if (paidUnits !== null && capitalUnits !== null && capitalUnits > BigInt(0) && paidUnits > capitalUnits) {
      add({ code: 'paid_exceeds_capital', severity: 'error', section: 'capital', fieldKey: K.capitalPaidAmount, message: 'Paid-up capital cannot exceed the share capital.' });
    }
  }

  const structure = choiceValue(answers[K.ownershipArrangement]);
  if (structure === SHARE_STRUCTURE.other) {
    add({ code: 'share_structure_other', severity: 'staff_review', section: 'capital', fieldKey: K.ownershipArrangement, message: 'A share structure other than ordinary shares with equal rights was requested.' });
  } else if (structure === SHARE_STRUCTURE.advice) {
    add({ code: 'share_structure_advice', severity: 'staff_review', section: 'capital', fieldKey: K.ownershipArrangement, message: 'Advice on the share structure was requested.' });
  }

  const arrangementLabels: Array<[string, string]> = [
    [K.sharesForOthers, 'Shares held on behalf of another party'],
    [K.directorsForOthers, 'Director acting on another party’s instructions'],
    [K.otherControl, 'Other control arrangements'],
  ];
  for (const [key, label] of arrangementLabels) {
    const value = choiceValue(answers[key]);
    if (value === YES_NO_CLARIFY.yes) {
      add({ code: `${key}_yes`, severity: 'staff_review', section: 'capital', fieldKey: key, message: `${label}: Yes. Our team will follow up on the details.` });
    } else if (value === YES_NO_CLARIFY.clarify) {
      add({ code: `${key}_clarify`, severity: 'needs_information', section: 'capital', fieldKey: key, message: `${label}: clarification required.` });
    }
  }

  // --- Registered office --------------------------------------------------
  const officeChoice = choiceValue(answers[K.officeChoice]);
  if (officeChoice === OFFICE_CHOICE.own) {
    const postalCode = textValue(answers[K.officePostalCode]);
    if (postalCode && !/^\d{6}$/.test(postalCode)) {
      add({ code: 'office_postal_code_invalid', severity: 'error', section: 'settings', fieldKey: K.officePostalCode, message: 'Enter a 6-digit Singapore postal code.' });
    }
    if (isTicked(answers[K.officeHoursPending])) {
      add({ code: 'office_hours_pending', severity: 'staff_review', section: 'settings', fieldKey: K.officeHoursPending, message: 'Registered office hours need confirmation.' });
    } else {
      const open = timeMinutes(answers[K.officeOpenTime]);
      const close = timeMinutes(answers[K.officeCloseTime]);
      if (open !== null && close !== null && close - open < 180) {
        add({ code: 'office_hours_too_short', severity: 'error', section: 'settings', fieldKey: K.officeCloseTime, message: 'The registered office must be open for at least three hours on each business day.' });
      }
    }
  } else if (officeChoice === OFFICE_CHOICE.firmService) {
    add({ code: 'office_firm_service', severity: 'staff_review', section: 'settings', fieldKey: K.officeChoice, message: 'Registered office service requested. The address is pending our acceptance.' });
  } else if (officeChoice === OFFICE_CHOICE.pending) {
    add({ code: 'office_pending', severity: 'needs_information', section: 'settings', fieldKey: K.officeChoice, message: 'The registered office arrangement is pending.' });
  }

  // --- Officers -----------------------------------------------------------
  const residentDirector = choiceValue(answers[K.residentDirectorHelp]);
  if (residentDirector === RESIDENT_DIRECTOR.assistance) {
    add({ code: 'resident_director_assistance', severity: 'staff_review', section: 'settings', fieldKey: K.residentDirectorHelp, message: 'Assistance with a Singapore-resident director was requested.' });
  } else if (residentDirector === RESIDENT_DIRECTOR.pending) {
    add({ code: 'resident_director_pending', severity: 'needs_information', section: 'settings', fieldKey: K.residentDirectorHelp, message: 'The Singapore-resident director is pending confirmation.' });
  }

  const secretaryChoice = choiceValue(answers[K.secretaryChoice]);
  if (secretaryChoice === SECRETARY_CHOICE.firm) {
    add({ code: 'secretary_firm', severity: 'staff_review', section: 'settings', fieldKey: K.secretaryChoice, message: 'The firm was asked to arrange the company secretary.' });
  } else if (secretaryChoice === SECRETARY_CHOICE.afterIncorporation) {
    add({ code: 'secretary_after', severity: 'staff_review', section: 'settings', fieldKey: K.secretaryChoice, message: 'The company secretary will be appointed after incorporation (within six months).' });
  } else if (secretaryChoice === SECRETARY_CHOICE.advice) {
    add({ code: 'secretary_advice', severity: 'staff_review', section: 'settings', fieldKey: K.secretaryChoice, message: 'Advice on the company secretary was requested.' });
  } else if (secretaryChoice === SECRETARY_CHOICE.identified) {
    const secretaryName = textValue(answers[K.secretaryName]).toLowerCase().replace(/\s+/g, ' ');
    const directors = parties.filter((party) => party.roles.includes(PARTY_ROLE.director));
    if (secretaryName && directors.length === 1 && directors[0].name.toLowerCase().replace(/\s+/g, ' ') === secretaryName) {
      add({ code: 'secretary_sole_director', severity: 'needs_information', section: 'settings', fieldKey: K.secretaryName, message: 'The company secretary cannot also be the company’s sole director.' });
    }
  }

  // --- Financial year -----------------------------------------------------
  if (choiceValue(answers[K.yearEndChoice]) === YEAR_END_CHOICE.advice) {
    add({ code: 'fye_advice', severity: 'staff_review', section: 'settings', fieldKey: K.yearEndChoice, message: 'Advice on the first financial year end was requested.' });
  }
  const firstFye = textValue(answers[K.firstFye]);
  if (firstFye) {
    if (!isRealIsoDate(firstFye)) {
      add({ code: 'fye_invalid', severity: 'error', section: 'settings', fieldKey: K.firstFye, message: 'Enter a valid first financial year end date.' });
    } else if (firstFye > addMonthsIso(today, 18)) {
      add({ code: 'fye_over_18_months', severity: 'staff_review', section: 'settings', fieldKey: K.firstFye, message: 'The first financial year end is more than 18 months away and may need Registrar approval.' });
    }
  }
  if (choiceValue(answers[K.financialYearPeriod]) === FY_PERIOD.advice) {
    add({ code: 'fy_period_advice', severity: 'staff_review', section: 'settings', fieldKey: K.financialYearPeriod, message: 'Advice on the accounting period was requested.' });
  }

  // --- Constitution -------------------------------------------------------
  const constitution = choiceValue(answers[K.rulesPreference]);
  if (constitution === CONSTITUTION.advice) {
    add({ code: 'constitution_advice', severity: 'staff_review', section: 'settings', fieldKey: K.rulesPreference, message: 'Advice on the company constitution was requested.' });
  } else if (constitution === CONSTITUTION.model && choiceValue(answers[K.modelAdoptionMode]) === MODEL_ADOPTION.advice) {
    add({ code: 'model_adoption_advice', severity: 'staff_review', section: 'settings', fieldKey: K.modelAdoptionMode, message: 'Advice on how to adopt the model constitution was requested.' });
  } else if (constitution === CONSTITUTION.custom && choiceValue(answers[K.customConstitutionStatus]) === CUSTOM_CONSTITUTION_STATUS.beingPrepared) {
    add({ code: 'custom_constitution_pending', severity: 'needs_information', section: 'settings', fieldKey: K.customConstitution, message: 'The custom constitution is still being prepared.' });
  }

  if (textValue(answers[K.otherAppointments])) {
    add({ code: 'other_appointments', severity: 'staff_review', section: 'settings', fieldKey: K.otherAppointments, message: 'Other appointments were noted. Our team will confirm whether they apply.' });
  }

  return {
    issues,
    parties,
    ownershipTotal: totalText,
    ownershipFullyDecided,
  };
}

export function hasBlockingIncorporationIssue(evaluation: Pick<IncorporationEvaluation, 'issues'>): boolean {
  return evaluation.issues.some((issue) => issue.severity === 'error');
}
