import { OAKDOC_DIRECTORS_REPEATER_TAG } from '@/lib/document-editor/oakdoc-repeater-definitions';
import { ARIAL_10 } from '@/content/resolution/resolution-oakdoc-xml';
import { HEADING_STYLE } from '@/content/resolution/first-board-resolution-oakdoc';
import { buildDirectorsResolutionOakDocMaster } from '@/content/resolution/board-resolution-oakdoc';
import { TAB, t, whenSet } from './corp-sec-oakdoc-kit';
import {
  DIRECTORS_FOR_RE_ELECTION,
  bullet,
  paragraph,
  partial,
  resolved,
  template,
  type CorpSecPartial,
  type CorpSecResolutionTemplate,
} from './corp-sec-resolutions';
import * as F from './corp-sec-fields';

/**
 * Board resolution convening an actual AGM. The main master uses a Constitution
 * reference rather than the generic numbered board master's Article 90; the
 * exact constitutional provision governing director rotation varies by company.
 * The agenda uses the same shared AGM fields and director shortlist as the
 * Notice of AGM so a document batch can reuse the values.
 */
export const CONVENE_ANNUAL_GENERAL_MEETING = partial(
  'resolution-agm-convening-meeting-directors',
  'AGM - Convening of Annual General Meeting (Directors)',
  'CONVENING OF ANNUAL GENERAL MEETING',
  (d) => [
    resolved(d, ['an Annual General Meeting of the Company be convened and held on:']),
    d.table([1600, 7900], [
      d.row([d.cell(1600, d.p('Date', { after: 80 })), d.cell(7900, d.p([F.AGM_DATE], { after: 80 }))]),
      d.row([d.cell(1600, d.p('Time', { after: 80 })), d.cell(7900, d.p([F.AGM_TIME, ' Singapore Time (UTC+08:00)'], { after: 80 }))]),
      d.row([d.cell(1600, d.p('Venue', { after: 80 })), d.cell(7900, d.p([F.AGM_VENUE], { after: 80 }))]),
    ]),
    d.gap(120),
    d.p('For the purpose of considering and, if thought fit, passing the following resolutions:', paragraph),
    d.p(['(i)', TAB, ...t`To receive and adopt the ${F.FS_DOCUMENTS} for the financial year ended ${F.FS_PERIOD_END}.`], bullet),
    d.p(['(ii)', TAB, 'To re-elect the following Directors retiring in accordance with the Constitution of the Company:'], bullet),
    d.repeat(OAKDOC_DIRECTORS_REPEATER_TAG, d.p(['•', TAB, F.DIRECTOR_NAME], bullet), DIRECTORS_FOR_RE_ELECTION),
    d.when(whenSet(F.AGM_RE_ELECTION_ARTICLE), d.p(t`The foregoing re-election is subject to ${F.AGM_RE_ELECTION_ARTICLE} of the Company’s Constitution.`, paragraph)),
    d.p(['(iii)', TAB, F.AGM_AUDITOR_ITEM], bullet),
    d.when(whenSet(F.DIRECTORS_FEES), d.p(['(iv)', TAB, ...t`To approve Directors’ fees of S$${F.DIRECTORS_FEES} for the financial year ended ${F.FS_PERIOD_END}.`], bullet)),
    d.p('To transact any other ordinary business which may properly be transacted at an Annual General Meeting.', paragraph),
  ],
);

export const CONVENE_AGM_NOTIFICATION = partial(
  'resolution-agm-convening-notification-directors',
  'AGM - Convening Meeting Notice and Lodgement (Directors)',
  'NOTIFICATION AND LODGEMENT',
  (d) => [
    resolved(d, ['the Company Secretary be authorised to issue the notice of the Annual General Meeting to the members in accordance with the Companies Act 1967 and the Constitution of the Company, and that all necessary documents and forms be completed, signed and, where required, lodged with the Accounting and Corporate Regulatory Authority.']),
  ],
);

export const CONVENING_AGM_PARTIALS: readonly CorpSecPartial[] = [
  CONVENE_ANNUAL_GENERAL_MEETING,
  CONVENE_AGM_NOTIFICATION,
];

/** Seeded only by seed-convening-agm-board-resolution.ts, not by the no-AGM starter. */
export const CONVENING_AGM_BOARD_TEMPLATE: CorpSecResolutionTemplate = {
  ...template('Board', 'Convening of AGM', 'Directors convene an AGM, specify the meeting details and ordinary business, and authorise notice to members and any required ACRA lodgement.', CONVENING_AGM_PARTIALS, 'CONVENING OF ANNUAL GENERAL MEETING'),
  build: () => buildDirectorsResolutionOakDocMaster({
    extraStyles: HEADING_STYLE,
    typeface: ARIAL_10,
    title: 'DIRECTORS’ RESOLUTIONS IN WRITING PURSUANT TO THE COMPANY’S CONSTITUTION',
  }),
};
