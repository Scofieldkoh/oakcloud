# OakCloud Filing Assistant: self-learning guided Bizfile filing

Written 2026-11-22. Builds on the [extension POC](./2026-11-22-acra-bizfile-extension-poc.md).

**Status:**
- Phase 1 (the learning and filling engine in the extension, plus AI proposals through OakCloud) is implemented.
- Phases 2 and 3 are not started.

## 1. Goal

A Chrome/Edge extension that fills Bizfile transactions from approved filing details. It:

- **learns** each Bizfile screen (fields, how to reach them, how to fill them, value formats) by watching a staff member once, or by asking AI;
- **keeps** what it learned as a versioned *screen map* and replays it on later filings;
- **notices** when Bizfile changes, or when something it does fails;
- **corrects itself**: first with checks that need no AI, then by asking AI to re-learn the broken part;
- lets staff **step in at any moment**: any click or keypress on Bizfile pauses it, and a Stop button is always shown;
- **never submits.** It cannot click Save draft, Review and confirm, Submit, declarations or payment. Staff review the screen and submit themselves.

## 2. Principles

| # | Principle | Why |
|---|-----------|-----|
| P1 | **AI chooses, code acts.** AI only picks among fields the extension actually observed on the screen, by reference. Locators, values and clicks are built and checked by deterministic code. | An AI can't invent a selector, type a value nobody approved, or click something not on the page |
| P2 | **No filing values leave the PC for AI.** Snapshots sent to AI contain structure only: labels, element types, sections, options and button names. The filing details' *keys* are sent, never their values. | Officers' personal data never goes to an AI provider |
| P3 | **Every write is verified.** After each fill the value is read back from the page and from React's own state. A value only on screen is a failure. | The POC showed screen and form state can disagree |
| P4 | **Fail closed.** A field that matches zero or several elements is not filled; the run pauses and says why. | A wrong field is worse than an empty one |
| P5 | **Corrections are tiered.** A verified correction found without AI (another locator, method or date format) is applied automatically and recorded. An AI proposal needs staff approval before it changes the screen map. | Self-correcting, but AI never silently changes behaviour |
| P6 | **Positive list of clickable buttons.** Only buttons that add or reveal parts of the form (Add …, Expand …, Show …) can be clicked, and only if the screen map names them. A fixed refusal list (submit, save, review, confirm, declare, pay, withdraw, delete, back, next, …) overrides everything, including AI. | The assistant cannot submit, even if a screen map or AI says so |
| P7 | **Staff stay in control.** Any trusted click or keypress on the Bizfile page during a run pauses the run. Step-by-step mode is available. | "Human can intercept at any time" |

## 3. How it works

```
 Filing details (staff or, later, OakCloud)      Screen maps (versioned, per transaction)
              │                                              │
              ▼                                              ▼
 ┌────────────────────────── Side panel ──────────────────────────────┐
 │  Fill: run map ──► step ──► content script: locate ► act ► verify    │
 │        ▲  pause/stop/step       │  self-correct (locator, method,   │
 │        │                        │  format), report result           │
 │  Learn: watch staff fill  ──► proposed map ──► staff approves ──► v+1│
 │         or "Ask AI"  ──► OakCloud tab ──► /api/filing-assistant/ai-proposals
 │  Screen maps: versions, history, export/import                       │
 │  Diagnose: POC probe tools                                           │
 └─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Screen map

A screen map is JSON, kept per transaction (for example `appoint-position-holder`). It holds:
- `version` and a `history` of what changed, who changed it (demonstration, auto-correction, AI, staff) and when;
- `screens`, each with:
  - a **fingerprint** for recognising and change-detecting the screen: path, headings, set of field labels;
  - ordered **steps**.

A step is one of two kinds:
- **fill:** filing-details key, control type, **locator**, fill method, value **format** (for example `DD MMM YYYY`), and option mapping for dropdowns and radios;
- **action:** an allowed reveal button, such as Add position holder, clicked only when the fields it reveals are missing.

A locator is an ordered list of candidates, each enough on its own to find the element:
- a stable id, with repeated card numbers turned into templates: `appoint-position-holder-card-{card}-individual-id-number`;
- `name`, used only when it is unique on the page (Bizfile reuses `text-input`);
- label plus question, and the section heading;
- placeholder.

Random-looking ids (UUIDs, which Bizfile generates for radios on each render) are never stored.

### 3.2 Learning

| Way | How | When |
|-----|-----|------|
| **Demonstration** (no AI) | Staff enter the filing details in the panel, press *Learn by watching*, then fill the Bizfile screen themselves. The extension records only *trusted* events: the fields staff changed, the reveal buttons they clicked, the dropdown options they chose. It matches each final value to a filing-details key (dates in any known format) and builds steps in the order staff worked. Unmatched fields are listed for staff to assign or ignore. | First learning; most accurate |
| **Exploring** (AI maps, or staff do) | *Explore this screen*. The assistant clicks the allowed reveal buttons, then tries every option of each radio group, list and dropdown, up to three levels deep, within 60 tries and 2 minutes. It records which fields each option shows or hides. Every field gets a condition, such as *shown when Address type = Local*; a field seen under several options keeps only what those sightings share. The value-free model goes to OakCloud's AI, which maps fields and controlling choices to filing-details keys; staff map anything left. Conditions become step conditions on filing details ("only when Address type is Local"), so a step is skipped when it does not apply. A condition on a choice no filing detail covers makes the step optional. Exploring never types, saves or submits; it stops when staff touch the page, and puts original choices back. | First learning of a screen with branches; finding everything a screen can show |
| **AI mapping (visible fields)** | Value-free snapshot of the fields showing now + filing-details keys → OakCloud → AI returns references to observed fields with control type, format and confidence → code builds locators → staff review → save. | Quick mapping of a simple screen |

**Dropdowns.** Dropdowns are built in many ways. Options may be `role=option`, SGDS / Bootstrap `.dropdown-item` buttons, or plain list items. Menus may be added when opened, or always present and shown by a class. They may open on the field, on a chevron beside it, or only when typing (the SGDS Combobox).

To choose an option, the runner tries in turn:
1. what staff clicked to open it while being watched;
2. the field itself;
3. a nearby chevron or toggle;
4. typing the option text.

It finds the option by what *becomes visible*, not only what is added to the page. Options may be buttons, but only inside a menu, and never submit buttons or links to other pages.

Learning by watching records how each dropdown opened and what its options look like, and the runner uses that first. A dropdown that accepts typing also falls back to the type-ahead methods.

If a dropdown still cannot be filled, **Diagnose → Inspect a dropdown** records while staff use it:
- the field's markup;
- which React handlers it and its wrappers have;
- what appears or changes on the page;
- the order of events.

It never records field values. The JSON export is what a maintainer needs to support that dropdown.

### 3.3 Running and self-correction

For each step the content script:
1. locates the element (P4);
2. acts: fills with the learned method and format, or clicks an allowed reveal button;
3. waits for the page to settle;
4. verifies (P3).

When something goes wrong, it corrects itself in this order:

1. **Locator healing:** the first candidate fails but a later one finds exactly one matching element. Fill, verify, and put the working candidate first (automatic, recorded).
2. **Method fallback:** the value is lost or held only on screen. Try the other methods for that control type, and keep the first verified one (automatic, recorded).
3. **Format fallback:** a validation message appears after filling a date. Try the other known date formats and keep the first that is accepted (automatic, recorded).
4. **AI repair:** nothing above works, or the field is gone. Pause and send OakCloud's AI the failing step plus a fresh value-free snapshot. Staff approve the proposal, the step is retried, and a new version is saved.
5. **Drift warning:** after each run, compare the screen with its fingerprint in the map. New fields, and for maps not learned by exploring also missing ones, are reported, and staff can re-learn the screen.

AI repair answers *where did the field go*. When the field was found but would not fill, AI is not asked automatically. If staff ask anyway and the AI points at the same field, the panel says there is nothing to change, rather than offering an approval that would not help.

Every run writes a log: each step, how the field was found, the method, verification, corrections and AI proposals. The last 50 runs are kept locally and can be exported.

### 3.4 AI through OakCloud

The extension never holds AI keys and never calls OakCloud with its own credentials:

- On the Settings tab staff enter OakCloud's address. The extension asks Chrome for permission to that one site, and registers a small **bridge** content script for it.
- The bridge only forwards requests to `/api/filing-assistant/*` from the signed-in OakCloud tab. OakCloud's normal session, permission checks and CSRF origin check all apply.
- `POST /api/filing-assistant/ai-proposals` handles two tasks:
  - `map-screen` maps filing-details keys to observed fields;
  - `repair-step` finds a replacement for a broken step.
- It calls `callAIWithConnector`, so the firm's configured AI connector and usage tracking apply. Input and output are validated with zod.

### 3.5 Using it (Phase 1)

1. **Install.** Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, and select `extensions/oakcloud-filing-assistant`. If the POC probe (`acra-bizfile-probe`) is still loaded, remove it; it is now the Diagnose tab.
2. **Connect OakCloud (optional, for AI).** On the Settings tab, enter OakCloud's address and press **Connect**. Chrome asks for permission to that site. Keep an OakCloud tab open and signed in. **Check** confirms who is signed in and whether AI is configured.
3. **Details tab.** Enter the filing details. They are kept only for the browser session and are never sent to AI.
4. **Learn tab (first time per screen).** Choose one of three ways:
   - **Explore this screen.** On a test filing, without touching the page until it finishes. It shows what each option reveals, then the AI's mapping with conditions. Map any leftover fields yourself, then **Save to screen map**.
   - **Start watching.** Fill the screen yourself, including clicking Add position holder and opening dropdowns as you normally would, then press **Finish**.
   - **Ask AI to map this screen.** Maps only the fields showing now.

   Re-learning part of a screen replaces only those steps and keeps the rest.
5. **Fill tab.** Open the Bizfile screen and press **Start filling**.
   - Clicking or typing on Bizfile pauses the run. **Pause** and **Stop** are always available.
   - **Pause after every step** gives step-by-step control.
   - A failed step pauses the run with Retry, Ask AI to repair, Skip and Stop. An AI repair changes the map only when you press **Approve and retry**.
6. **Review and submit in Bizfile yourself.** The assistant stops with the screen filled.
7. **Screen maps tab.** Shows the version, steps, history and recent runs. **Export** a map to share it with colleagues, who **Import** it. Phase 2 will share maps through OakCloud.

### 3.6 Files

| Path | Role |
|------|------|
| `extensions/oakcloud-filing-assistant/manifest.json` | MV3 manifest. Bizfile host permission; the OakCloud host is requested at run time. |
| `src/core/dom.js` | Labels (including Bizfile's doubled labels), control types, fill methods, verdicts, the never-click and reveal-button rules, waiting for the page to settle |
| `src/core/formats.js` | Date and text formats, and matching typed values to filing details |
| `src/core/schemas.js` | Filing-details schemas per transaction |
| `src/core/locator.js` | Locator candidates, id templating, fail-closed resolution, healing, merging |
| `src/core/snapshot.js` | Value-free screen snapshots and fingerprints (drift detection) |
| `src/core/playbook.js` | Screen maps: versions, history, validation |
| `src/core/recorder.js` | Learning by watching |
| `src/core/runner.js` | Running a step with verification, self-correction and step conditions |
| `src/core/explorer.js` | Exploring a screen: reveal buttons, every option, which fields each shows |
| `src/content.js`, `src/page-signals.js` | Content script (Bizfile), and the in-page reader of React/Vue state |
| `src/bridge/oakcloud-bridge.js` | Forwards `/api/filing-assistant/*` requests from the OakCloud tab |
| `src/panel/*` | Side panel tabs: Details, Fill, Learn, Screen maps, Diagnose, Settings |
| `src/services/filing-assistant/ai-proposals.ts` | OakCloud AI service: input and reply validation, name masking, reference checks |
| `src/app/api/filing-assistant/{status,ai-proposals}/route.ts` | The two endpoints (see the API reference) |

### 3.7 Verification

- `npx vitest run __tests__/extensions __tests__/services/filing-assistant-ai-proposals.test.ts` runs the unit tests for:
  - the extension's core modules (jsdom);
  - the AI service, including that values and capitalised names never reach the prompt and that invented references are dropped.
- `npm run test:chromium:filing-assistant` loads the real extension into Chromium, against a React stand-in for the appointment screen (`__tests__/fixtures/filing-assistant/bizfile-appoint-app.tsx`) and a fake OakCloud whose AI answers deterministically. Set `BROWSER_TEST_CHROMIUM` in a cloud session. It covers:
  - learning by watching (reveal button, doubled radio labels, a "Select position" dropdown, date format, capitals; Save draft left to staff);
  - replaying and verifying all fields;
  - healing a changed id;
  - AI repair applied only after approval, with no personal data in the request;
  - AI mapping that saves nothing until approved;
  - switching date format on a validation message;
  - pausing when staff click the page;
  - refusing a tampered map's "Review and confirm" step;
  - the footer buttons never being clicked;
  - exploring a screen with conditional sections: what each option shows, AI mapping with conditions, and filling only what applies;
  - learning an SGDS-style dropdown opened from its chevron (menu kept and hidden by style, button options), and finding the option by typing when there is no chevron.

  The Diagnose suite also checks that the dropdown inspector reports the opening handler and the menu without capturing values.
- The stand-in reproduces Bizfile patterns, not Bizfile. Run the Learn and Fill flow once on live Bizfile with a test company before relying on it.

## 4. Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | The extension: screen maps, learning by demonstration, AI mapping and repair through OakCloud, runner with verification and self-correction, pause on interception, run log, diagnose tools. Filing details entered in the panel. Maps stored in the browser, with export and import. | Implemented |
| 2 | Shared screen maps in OakCloud: database, versions, approvals, audit. The extension pulls the latest approved map, and corrections are pushed back for review. | Not started |
| 3 | Filing details from OakCloud: the company action "ACRA filing assistant" opens Bizfile with an approved filing (officer from Contacts, resolution reference). After staff submit, the acknowledgement is captured and the officer record updated through the BizFile operation receipt / evidence / effect pattern. | Not started |
| 4 | More transactions: cessation, change of particulars, registered address, annual return. | Not started |

## 5. Transactions

Phase 1 ships one filing-details schema: **Appoint position holder (individual)**.

| Key | Field |
|-----|-------|
| `category` | Individual or Corporate |
| `position` | Position held (Director, Secretary, …) |
| `appointmentDate` | Date of appointment |
| `idType` | Identification type |
| `idNumber` | Identification number |
| `name` | Name as per identification document |
| `nationality` | Nationality |
| `dateOfBirth` | Date of birth |
| `addressType` | Local or Foreign |
| `postalCode`, `block`, `street`, `unit`, `building` | Local address |
| `foreignAddress1`, `foreignAddress2` | Foreign address |
| `email` | Email address |
| `mobile` | Mobile number |

Dates are stored as `YYYY-MM-DD` and formatted to whatever each screen expects. Live Bizfile expects `DD MMM YYYY`.

## 6. Open points

- Corporate position holders and multiple position holders in one filing: card templating supports them, but the schema and UI do not yet.
- Bizfile terms of use and Corppass rules on automated assistance: still to confirm before use on real filings beyond attended testing.
- Phase 2 will need a decision on who may approve a screen-map change for the whole firm.
