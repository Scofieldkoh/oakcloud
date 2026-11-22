# ACRA Bizfile guided filing: browser extension proof of concept

Written 2026-11-22. Status: **POC run once on live Bizfile (2026-11-22); the result is in section 5.** The follow-up design is the [Filing Assistant](./2026-11-22-acra-filing-assistant.md). Nothing here files anything.

## 1. Why an extension

The attended Playwright pilot (`scripts/install-oakcloud-acra-agent.ps1`) could not navigate or fill Bizfile reliably. Its main problems were:

- it found fields by position (`nth()`), and positions shift when Bizfile shows or hides fields;
- it waited fixed times instead of waiting for the page;
- it found labels only through `label[for]` or `aria-label`;
- it had no idea which screen it was on;
- it explored by changing the live form.

Two ways to rebuild it were compared: a Chrome/Edge extension and a local Playwright agent. The extension was chosen for staff use, for four reasons:

- staff sign in to Singpass/Corppass in their normal browser;
- the browser is not flagged as automated;
- the guidance sits in a side panel next to the form;
- OakCloud is reached directly, with no local server and no pairing token.

Playwright stays as the development tool: recording Bizfile screens, offline replay tests, and end-to-end tests of the extension.

The extension's one open risk is technical. Input an extension creates is marked as not coming from the user (`isTrusted=false`), and some components ignore that kind of input. This POC exists to measure that risk on Bizfile's own controls before any further build.

## 2. What was built

The probe was first built as its own extension. Since 2026-11-22 it is the **Diagnose** tab of the [Filing Assistant](./2026-11-22-acra-filing-assistant.md), in `extensions/oakcloud-filing-assistant/`. Paths below are the current ones. It is a Manifest V3 extension, loaded unpacked, with no build step.

| File | Role |
|------|------|
| `manifest.json` | Runs only on `https://*.bizfile.gov.sg/*`. Permissions: `sidePanel`, `scripting`, `storage`. |
| `src/core/dom.js` | DOM logic: label and label-source detection, control-type detection, safety rules, fill methods, verdicts. Shared by the content script, the side panel and the unit tests. |
| `src/content.js` | Isolated-world content script in every Bizfile frame: pick mode with an overlay, running a test, rechecking a field, scanning the page. |
| `src/page-signals.js` | Main-world script that reads what React or Vue actually holds for a field, and which frameworks the page uses. It only reads. |
| `src/panel/diagnose.js` | The Diagnose tab: scan, pick, run, results, recheck, the staff member's own verdict, and JSON export. |

What the probe does **not** do:

- **Never operates:** buttons, links, tabs, password fields, file inputs, disabled fields.
- **Refuses** any field or option whose label or question looks like a declaration, confirmation, consent, submission, payment, save, delete, or a step control such as Next or Proceed.
- **Passes no clicks to Bizfile while picking:** they are stopped before Bizfile sees them.
- **Sends nothing to the network:** results stay in the browser session's storage until exported.
- **Export is redacted:** any value unrelated to the test value (for example real prefilled data) is reduced to its length.

### Fill methods compared

| Control type | Methods |
|--------------|---------|
| Text, date | `set-value-events` (set the value, then send input and change events); `insert-text-command` (the browser editing command, whose events are marked as genuine user input); `key-by-key` (key events per character, for masked fields) |
| Native dropdown | `set-value-events` |
| Custom dropdown | `pointer` (full pointer, mouse and click sequence); `click` (`element.click()` only); `keyboard` (arrow keys and Enter) |
| Type-ahead search | type with one of the text methods, then choose the suggestion by `pointer` or `keyboard` |
| Radio, checkbox | `click`, `pointer`, `label-click`, `keyboard` |

### Verdicts

| Verdict | Meaning |
|---------|---------|
| Kept | Still shown 2 seconds after leaving the field, and the page's framework holds the same value (when it can be read) |
| Shown only; page state disagrees | The screen shows the value but React or Vue holds something else, so Bizfile will probably drop it |
| Kept, but an error appeared | A validation message appeared that was not there before |
| Lost | The field no longer shows the value |
| Method failed | For example, the dropdown never opened |
| Inconclusive | The field already showed the value before the test |

The automatic verdict is only the first check. The deciding one is manual:
1. Move to the next Bizfile step and come back, or open the review page.
2. Press **Recheck**.
3. Record whether Bizfile kept the value, lost it, or showed an error.

## 3. Verification so far

- `npx vitest run __tests__/extensions/filing-assistant-dom.test.ts` (jsdom unit tests) covers:
  - label sources and control-type detection;
  - the safety rules;
  - the fill methods;
  - verdicts;
  - finding a field again after it re-renders.
- `npm run test:chromium:filing-assistant` (`__tests__/chromium/filing-assistant-diagnose.chromium.test.ts`) loads the real extension into Chromium. It runs against a React stand-in form (`__tests__/fixtures/filing-assistant/probe-fixture-app.tsx`) served at a routed `www.bizfile.gov.sg` address. It confirms that:
  - a field that ignores non-genuine input is reported **Lost** with `set-value-events` and **Kept** with `insert-text-command`;
  - a dropdown that opens on mouse-down **fails** with `click` and is **Kept** with `pointer` and `keyboard`;
  - the masked date, radio and type-ahead fields are kept;
  - the declaration checkbox and the Next button are refused;
  - no click reaches the page while picking.

  Set `BROWSER_TEST_CHROMIUM` when Playwright's pinned browser is missing (in a cloud session, the Chromium under `/opt/pw-browsers`).

The stand-in only shows that the probe measures correctly. It says nothing about Bizfile itself.

## 4. Running the POC on Bizfile

Prerequisites:
- a staff PC with Chrome or Edge;
- a test company the firm is authorised to act for;
- dummy officer particulars.

**Do not submit the transaction.** Discard the draft afterwards.

1. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, and select `extensions/oakcloud-filing-assistant`. The probe is on its **Diagnose** tab.
2. Sign in to Bizfile as usual and open the officer-change transaction: appoint a director.
3. Click the probe's toolbar icon to open the side panel. If Bizfile was already open, reload the tab.
4. **Scan page** on each screen of the transaction. This records frameworks, frames, shadow DOM, component libraries and how fields are labelled.
5. For each control below, pick it, then run every method. Use a different value or option for each method.
6. After each round:
   1. go to the next step and back, or to the review page;
   2. press **Recheck**;
   3. record what Bizfile did.
7. **Export JSON** and attach it to this plan's results (section 5).

| Control | What to try |
|---------|-------------|
| A text field (name) | all three text methods |
| ID number | all three text methods |
| Date of appointment | all three text methods; note if it is read-only and needs the calendar |
| Position held | all three dropdown methods |
| A radio question | all four methods |
| Nationality or country search | all four type-ahead methods |
| Postal code | text methods. Press any "retrieve address" button **yourself**, then Recheck the address fields to see whether the lookup used the filled value. |

## 5. Results

The probe was run on 2026-11-22 against live Bizfile, on Appoint/Withdraw position holders (`/registry/update-personnel/appoint-withdraw-position-holder-form`), with a test company and dummy data.

### Page facts

| Fact | Finding |
|------|---------|
| Framework | React, SG Design System. No iframes; fields are not in shadow DOM (the page has 2 shadow roots elsewhere). |
| Fields on arrival | None. The appointment card appears only after clicking **Add position holder**, which the probe correctly does not list or click (it is a button). |
| Field ids | Stable and structured: `appoint-position-holder-card-1-individual-id-number`, `appoint-position-holder-card-1-position-held-1-date-of-appointment`. They are the best locator. |
| Field names | Not unique: `text-input` is shared by several fields. |
| Labels | `label[for]` for 6 fields, nearby text only for 4 (ID number, name, email, mobile), placeholder only for 3 (including Position held). |
| Radio ids | Random UUIDs (Category, Address type). They cannot be stored; use the question and option labels. |
| Duplicate ids | The two foreign-address inputs share `input-foreign-address-line-1`. |
| Position held | `<input placeholder="Select position">` with no dropdown role. The probe classified it as text; it now treats inputs with a "Select…" placeholder as dropdowns. |

### Fill results

| Control | Best method | Kept after recheck? | Notes |
|---------|-------------|---------------------|-------|
| ID number | `set-value-events` | Yes. React state held the value; confirmed by hand. | Staff report all three text methods kept the value |
| Date of appointment, date of birth | any text method | Yes (reported by staff) | Must be entered as `DD MMM YYYY`, for example `01 Feb 2026` |
| Position held | not yet tested | | Test as a custom dropdown |
| Category / Address type radios | not yet tested | | |
| Postal code lookup | not yet tested | | |
| Review page | not yet tested | | Fill everything, open Review and confirm, check values, discard |

**Conclusion so far:** text and date fields accept input created by an extension, using the simplest method, and React's own state agrees. Building the extension is justified. The dropdown, radios, lookups and the review page remain to be confirmed. The Filing Assistant's runner verifies each of them anyway, and falls back to other methods automatically.

## 6. Decision after the run

| Outcome | Next step |
|---------|-----------|
| Every control is kept by at least one method | Build the guided-filling extension: screen playbooks as data, one driver per control type using the winning method, a side panel connected to OakCloud, and the review page compared against the approved payload |
| One or two controls refuse every method | Fill those through the `chrome.debugger` API (genuine input, with a visible banner), or leave them for staff |
| Most controls refuse | Stay with Playwright, using a persistent profile and an overlay in the page |

Questions the run should also answer:
- Does Bizfile fill in an officer's particulars from an NRIC?
- Are any parts of the transaction in iframes or shadow DOM?
- Do Bizfile's field labels support finding fields by role and name?

Before going beyond attended, field-by-field filling, check ACRA's Bizfile terms of use and Corppass rules on automated access.
