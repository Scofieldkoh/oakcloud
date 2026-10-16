import { OAKDOC_DIRECTORS_REPEATER_TAG } from '@/lib/document-editor/oakdoc-repeater-definitions';
import { TAB, t, whenBlank, whenSet } from './corp-sec-oakdoc-kit';
import {
  AUDIT_EXEMPTION_MEMBERS,
  DIRECTORS_FOR_RE_ELECTION,
  RECEIVE_FINANCIAL_STATEMENTS,
  bullet,
  partial,
  resolved,
  template,
  type CorpSecPartial,
  type CorpSecResolutionTemplate,
} from './corp-sec-resolutions';
import * as F from './corp-sec-fields';

/**
 * Members' written resolutions for the yearly cycle of a private company
 * that does not hold an AGM, from the firm's three Word references:
 * dispensing with AGMs (s.175A(1)(a)), financial statements sent within
 * the s.203 period (s.175A(1)(b)), and a dormant relevant company
 * (s.175A(1)(c), s.201A). Each template reuses the corporate secretarial
 * partials that already fit (adoption of financial statements, audit
 * exemption) and adds the partials below.
 */

const ACT = 'the Companies Act 1967';

// For the one financial year only, as the firm prefers to decide each year.
export const DISPENSE_WITH_AGM = partial('resolution-agm-dispense', 'AGM - Dispense with AGM (Members)', 'DISPENSATION WITH ANNUAL GENERAL MEETING', (d) => [
  resolved(d, t`pursuant to Section 175A of ${ACT}, the Company dispense with the holding of an annual general meeting for the financial year ended ${F.FS_PERIOD_END}, and that the matters which would otherwise be dealt with at that meeting be dealt with by these written resolutions under Section 184A of ${ACT}.`),
]);

export const FINANCIAL_STATEMENTS_SENT = partial('resolution-agm-financial-statements-sent', 'AGM - Financial Statements Sent, No AGM (Members)', 'NO ANNUAL GENERAL MEETING', (d) => [
  resolved(d, t`the ${F.FS_DOCUMENTS} for the financial year ended ${F.FS_PERIOD_END} were sent to all members of the Company on ${F.FS_SENT_DATE}, within the period required by Section 203(1)(b) of ${ACT}, and that no member has given notice under Section 175A(4) of ${ACT} requiring the Company to hold an annual general meeting for that financial year.`, 'noted'),
  resolved(d, [`accordingly, no annual general meeting be held for that financial year, as Section 175A(1)(b) of ${ACT} permits, and that the matters which would otherwise be dealt with at that meeting be dealt with by these written resolutions under Section 184A of ${ACT}.`]),
]);

export const DORMANT_COMPANY = partial('resolution-agm-dormant-company', 'AGM - Dormant Company Exemptions (Members)', 'DORMANT COMPANY', (d) => [
  resolved(d, t`the Company has been dormant, within the meaning of Section 205B of ${ACT}, throughout the financial year ended ${F.FS_PERIOD_END}; is neither a listed company nor a subsidiary of a listed company; and its total assets (or, where it is a parent company, the consolidated total assets of its group) did not exceed S$500,000 at any time during that financial year.`, 'noted'),
  resolved(d, ['it be recorded that the Company is accordingly a dormant relevant company, and that for that financial year:']),
  d.p(['(a)', TAB, `the Directors are exempt under Section 201A of ${ACT} from preparing financial statements; and`], bullet),
  d.p(['(b)', TAB, `the Company need not hold an annual general meeting, under Section 175A(1)(c) of ${ACT}.`], bullet),
  d.gap(60),
  resolved(d, ['the Directors have confirmed that the Company is solvent, being able to pay its debts as they fall due.'], 'furtherNoted'),
]);

const RETIRING = 'retiring from office whether pursuant to the Constitution of the Company or voluntarily, and being eligible';

/** Every director ticked, named, whether retiring under the Constitution or of their own accord. */
export const RE_ELECT_ALL_DIRECTORS = partial('resolution-agm-re-elect-all-directors', 'AGM - Re-election of All Directors (Members)', 'RE-ELECTION OF DIRECTORS', (d) => [
  // "Directors" when more than one is ticked, "Director" for one.
  d.when(whenSet(F.DIRECTORS_ARE_PLURAL), resolved(d, [`the following Directors, ${RETIRING} and having offered themselves for re-election, be re-elected as Directors of the Company:`], 'ordinary')),
  d.when(whenBlank(F.DIRECTORS_ARE_PLURAL), resolved(d, [`the following Director, ${RETIRING} and having offered to be re-elected, be re-elected as a Director of the Company:`], 'ordinary')),
  d.repeat(OAKDOC_DIRECTORS_REPEATER_TAG, d.p(['•', TAB, ...t`${F.DIRECTOR_NAME} (${F.DIRECTOR_ID_LABEL} ${F.DIRECTOR_ID})`], bullet), DIRECTORS_FOR_RE_ELECTION),
]);

export const FILE_ANNUAL_RETURN = partial('resolution-agm-annual-return', 'AGM - Filing of Annual Return (Members)', 'FILING OF ANNUAL RETURN', (d) => [
  resolved(d, t`the Company Secretary and/or ${F.FIRM_NAME} be authorised to lodge the annual return of the Company for the financial year ended ${F.FS_PERIOD_END} under Section 197 of ${ACT}, and any other returns relating to it, with the Accounting and Corporate Regulatory Authority for and on behalf of the Company.`),
]);

/** The partials this module adds; the templates also preset existing corporate secretarial ones. */
export const AGM_PARTIALS: readonly CorpSecPartial[] = [
  DISPENSE_WITH_AGM,
  FINANCIAL_STATEMENTS_SENT,
  DORMANT_COMPANY,
  RE_ELECT_ALL_DIRECTORS,
  FILE_ANNUAL_RETURN,
];

export const AGM_RESOLUTION_TEMPLATES: readonly CorpSecResolutionTemplate[] = [
  template('Members', 'Dispense with AGM', 'All members resolve under Section 175A to dispense with the AGM for the financial year, then adopt the financial statements, note the audit exemption, re-elect the directors and authorise the annual return. For audited accounts, swap the audit exemption for “Re-appointment of Auditors”.', [DISPENSE_WITH_AGM, RECEIVE_FINANCIAL_STATEMENTS, AUDIT_EXEMPTION_MEMBERS, RE_ELECT_ALL_DIRECTORS, FILE_ANNUAL_RETURN]),
  template('Members', 'Financial Statements Sent (No AGM)', 'No AGM because the financial statements were sent to members within five months of the year end (Section 175A(1)(b)): adopt them, record the send date, note the audit exemption, re-elect the directors and authorise the annual return.', [RECEIVE_FINANCIAL_STATEMENTS, FINANCIAL_STATEMENTS_SENT, AUDIT_EXEMPTION_MEMBERS, RE_ELECT_ALL_DIRECTORS, FILE_ANNUAL_RETURN]),
  template('Members', 'Dormant Company', 'A dormant relevant company (total assets up to S$500,000) records that it need not prepare financial statements (Section 201A) or hold an AGM (Section 175A(1)(c)), re-elects the directors and authorises the annual return.', [DORMANT_COMPANY, RE_ELECT_ALL_DIRECTORS, FILE_ANNUAL_RETURN]),
];
