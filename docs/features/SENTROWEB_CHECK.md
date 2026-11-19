# Sentroweb check

A **Sentroweb check** screens a company, its current directors and its current shareholders on
[Sentroweb](https://sentroweb.ingenique.net) (Acuris AML/CFT: FATF country risk, PEP and
special-interest persons and entities). Oakcloud drives the Sentroweb web app with a headless
browser, stores one result per name together with Sentroweb's own PDF report, and shows them on the
company's **Screening** tab.

A possible match, an error or anything uncertain is **never** shown as clear.

## What a person does

1. Open a company and click **Sentroweb check** (shortcut `F4`; needs permission to edit the company).
2. The dialog lists the company, its current directors and its current shareholders. Tick up to 10
   names. It shows the most Sentroweb credits the run can use (1 per name; a name Sentroweb has
   searched before is free) and says that each name is added to Sentroweb ongoing monitoring.
3. **Run check** queues the run and opens the **Screening** tab, which refreshes every 3 seconds
   while the run is queued or running.
4. Each name ends as **Clear**, **Possible match**, **Error** or **Not run**. Possible matches can be
   expanded to see the hits. Every checked name has Sentroweb's PDF report (filed under the
   company's Documents with type `SENTROWEB_REPORT`, and opened from the Screening tab through the
   `report` route) and a screenshot of the result block.

Another run for the same company within 10 minutes of the previous one that spent credits asks for
confirmation (**Run again anyway**). Only one run per company can be queued or running.

## Result rules

| Rule | Detail |
| --- | --- |
| Inputs | The name plus the Individual/Entity tick. An **individual** is also searched with the **country** and **date of birth** Oakcloud holds, when it holds them; an entity (the company, a corporate holder) is searched by name only. Gender (`MALE` or `FEMALE`) is sent when the linked contact has one. Fuzzy Search is off unless the person ticks it for the run. See "Country, date of birth and gender" and "Fuzzy search" below. Sentroweb has no UEN or ID field, so UEN and ID numbers are Oakcloud metadata only. See "Country and date of birth" below. |
| Who is screened | The company (Entity), current `DIRECTOR`, `MANAGING_DIRECTOR`, `ALTERNATE_DIRECTOR`, `NOMINEE_DIRECTOR` officers and current shareholders. Corporate holders are searched as Entities. Secretaries, the CEO and former officers are not screened. The same person in several roles is one search: records match when they share a contact, or an ID type and number, or (for records without either conflicting) the same name and kind. Groups are joined repeatedly, so a later record that links two earlier groups merges them all (contact or ID number first, then name). Two records with different ID numbers or different contacts are never merged by name, so a name-only record joins exactly one person. |
| Classification | **Clear** only if the captured search response and the page's `<Category> [N matches]` titles both show 0 for every expected category (Entity: SIE; Individual: FATF, PEP, SIP; the FATF heading is shown when a country was searched (both recorded country searches show it) and is then required; for a name-only individual search it may be absent, and the page then has just the PEP and SIP headings. The FATF array in the response must still be present and empty), the response echoes the country and date of birth that were sent (another or missing echo is `RESULT_MISMATCH`, never clear), no other array in the response holds anything, the response describes the search we submitted, and the two sources agree. Any count above 0 in either source is a **Possible match**. Everything else is an **Error**. No path defaults to Clear (`src/services/sentroweb/result-parser.ts`). |
| Evidence | A Clear result needs Sentroweb's PDF. Without it the result is an Error (`EVIDENCE_MISSING`). A Possible match without the PDF stays a Possible match and carries `EVIDENCE_MISSING`. |
| Overall result | Any Possible match, otherwise anything Error/Not run or a failed run is **Incomplete**, otherwise **Clear**. |
| Run limits | At most 10 names, one active run per company (database-enforced), 10-minute cooldown unless `force`. The cooldown follows any run that spent or may have spent credits, including an interrupted run whose in-flight search was submitted; only a run known to have submitted nothing (for example a failed login) is exempt. A run stops after any error except a missing PDF, because searching on after a layout change or an unexpected credit cost would spend credits on results we cannot read. |

### Side effects on Sentroweb

- **Credits:** 1 per confirmed search. The client checks the balance before the first search and
  fails with `INSUFFICIENT_CREDITS` without searching. The confirm box must say exactly
  "1 credit(s)"; otherwise the client clicks CANCEL and records `UNEXPECTED_CREDIT_COST`.
  **A name Sentroweb has searched before is not charged again.** Sentroweb's quota check then
  answers `deductCredit: false` with no unique names and the page searches at once, with no
  confirm box. The client takes that path only on that exact answer and records zero credits for it
  (`creditsUsed` counts what Sentroweb reports, so it can be lower than the number of names). A
  quota answer that asks for credits but shows no box fails closed with `LAYOUT_CHANGED`, nothing
  submitted. A free search still counts as submitted for the cooldown.
  Whether a search was submitted is latched from the page's own search request, not from our
  reading of the quota answer: if the page searched on its own and we then reject the answer, or an
  abort or timeout follows, or the SEARCH click call itself fails, the name stays submitted (cooldown, never retried) and its charge is
  unknown, so it counts as one credit. Before a failed attempt is called "not submitted" the client
  reloads the search page, which drops the old page's pending calls, so a slow quota answer cannot
  start a search after the fact; if that reload itself fails (a lost connection, a hung page), nothing
  can be proven and the attempt is treated as submitted, whatever events were observed. Even after a
  clean reload a missing request event proves nothing (a request cancelled by the reload can still
  have reached the server), so "not submitted" is only reported when the page never asked for a
  quota, or its quota answer asked for credits (the page then waits for a CONFIRM we never click).
  A quota that is unanswered, free or unreadable stays submitted. Only a search Sentroweb itself said was free is counted as
  zero when it fails afterwards.
  Exporting the PDF appeared free in discovery (balance unchanged), but that was inferred from the
  balance only.
- **Ongoing monitoring:** every Sentroweb search adds the name to the account's ongoing monitoring,
  as the team's manual searches already do. The search form offers no way to turn that off, and the
  Sentroweb Settings menu was not explored. Oakcloud never opens *Manage Ongoing Monitoring* and
  never clicks Match Yes/No, "All results are false match", Save or Cancel on a result.
- **A submitted search is never submitted again** by the client, the service or recovery.

## Where the date of birth comes from

- **Contacts page.** An individual contact has an optional **Date of birth** (new, edit, and a line on
  the contact page). A real date from 1 Jan 1900 to today (also no more than 150 years back), the same
  rule used by Sentroweb. A corporate contact has none. Legacy ISO timestamps must carry `Z` or an
  explicit numeric offset; timestamps without a timezone are rejected rather than interpreted locally.
- **BizFile.** The extraction asks for a date of birth **only when the document explicitly prints one**
  for an officer or an individual shareholder, and never works one out from the NRIC or FIN. ACRA
  business profiles normally do not print it, so this rarely fills anything; a missing, malformed or
  implausible value is dropped and **never clears** a saved date. A printed date shows as a field on the
  person in the BizFile review (and makes that person a reviewable change). When the review is approved
  it is written to the contact only if the person is the contact by **ID number**, was **created** from
  the extract, or was **picked by the reviewer**; a match by name alone writes nothing. It **replaces**
  a different saved date only after an explicit **Replace the saved date of birth (…) with (…)**
  checkbox is ticked. Saving refreshes contact matches first: a newly discovered replacement blocks
  saving, opens that section, and shows both dates even if the section had never been visited. Editing
  the proposed date or choosing another contact clears the agreement. The reviewed payload carries
  `dateOfBirthReplaces` (the exact saved `YYYY-MM-DD`) into the prepared, signed plan. The server
  returns **409 Conflict** if a replacement has no agreement or the saved date changed since review
  (including being cleared); an atomic compare-and-set also catches changes between read and write.
  The entire import rolls back on a stale replacement. Agreeing officer/shareholder entries for the
  same contact share that transaction's first successful replacement (one replacement/audit), rather
  than treating their own update as an external stale edit. Successful replacements are audited as old
  and new. Clear the proposed DOB to keep the saved one without replacing it.
  **Companies → Update from BizFile** has its own card, "Date of birth changes", above the officer and
  shareholder changes. It lists each person whose saved date differs, with an unticked box "replace the
  saved date of birth (old) with (new)". Ticked, the exact saved date is sent as the agreement. Unticked
  (the default), the proposed date is left out and the saved one is kept, while the person's other updates
  still apply. If a saved date changes after a box was ticked, applying is stopped, the tick is cleared
  and the card shows the new date. A tick belongs to one file, person, matched contact and proposed date,
  so it never carries over to another contact or after "Upload Different File", and the choice is still
  there after "Back to review" from the plan dialog.
  Other sources only fill an empty date and report a difference as a conflict.
- **No backfill, no automatic re-screening.** Past BizFile documents are not re-read, and a changed date
  affects only the next manual Sentroweb check.

## Country, date of birth and gender

For an individual the run sends the country, the date of birth and the gender Oakcloud holds, so a common name
returns fewer unrelated hits. Nothing is guessed: a field Oakcloud cannot supply with certainty is
left blank for that person, and the run carries on.

| Field | Source | Rule |
| --- | --- | --- |
| Country | The linked contact's `nationality`, else the officer or shareholder row's `nationality` (the same precedence as the ID number). | Mapped to one exact option of Sentroweb's country list (`src/lib/sentroweb/countries.ts`): an exact country name, an upper-case two-letter flag code (`SG`, `MY`), a listed three-letter code (`SGP`), or a listed demonym or alternative name (`Singaporean`, `Hong Kong`). Ambiguous words (`Dominican`, `Guinean`, `Congolese`, `Korean`), unknown text and lower-case two-letter words map to nothing. |
| Date of birth | The linked contact's `dateOfBirth` (officer and shareholder rows hold none). It is entered on the Contacts page (individuals), or filled and updated from a BizFile review; see the preceding section. It is stored as midnight UTC and sent as its UTC calendar date, so it never moves a day. | Sent as `YYYY-MM-DD` under the same rule as Contacts: from 1 Jan 1900 to today and no more than 150 years back. |
| Gender | The linked contact's `gender` (Contacts page, optional: Male, Female, Other). Officer and shareholder rows hold none. | `MALE` and `FEMALE` tick the Male or Female box. `OTHER` and blank send nothing (Sentroweb has two boxes only), and both boxes stay unticked. |

When one person has several records (a director and a shareholder), a field is sent only if every
stated value agrees. Two different nationalities, or one that cannot be mapped next to one that
can, leave the country blank.

What is requested is stored on the result (`requestedCountry`, `requestedDateOfBirth`,
`requestedGender`; the date is never returned by the API, only whether one was requested). Under
each name the confirm dialog says "Will send: name, country (Singapore), date of birth, gender
(Male)". The Screening tab says "Sent: ..." only for a result that was read back (clear or possible
match) **and** whose answer echoed exactly the name, type, country, date of birth and fuzzy flag we
sent (`searchEchoVerified`). A possible match is still shown as a possible match when the echo
differs, but its details read "Requested, not confirmed as sent". The gender is the exception even
for a verified result: Sentroweb's answer does not echo it (the recorded responses carry no gender),
so it always reads "Requested, not confirmed: gender (Male)" and never "Sent". The client does
read the Male and Female boxes back before SEARCH, but that is our own page state, not Sentroweb's
confirmation. A result that never ran, failed before SEARCH or ended in an error says "Requested, not
confirmed as sent: ...", because nothing proves what reached Sentroweb.

The browser client fills the country and the date of birth **first**, while SEARCH is still
disabled (it enables once a name and a type are filled in), and types the name and ticks the type
last. Nothing can submit the form while the country is being chosen, not even an Enter key in the
dropdown (Enter is pressed only while SEARCH is disabled). If the page nevertheless asks for a quota
or starts a search before our click, the attempt is recorded as submitted (cooldown, no retry, one
credit counted) and the client stops. The client types the country to narrow the list, then takes the option whose text is
exactly the wanted one (Enter when it is the first listed, as in the recorded flow; otherwise a click
on that option, so "Guinea" never picks "Equatorial Guinea"), types the date, and reads back the
country shown, the date typed, the search type, the Fuzzy Search box and the Male and Female boxes just before SEARCH. If
any field is not exactly what was wanted the attempt fails `LAYOUT_CHANGED` before SEARCH: not
submitted, no credit, nothing sent. Sentroweb's answer must echo the same country and date of birth.

**Credits.** A search with different details (a country or a date of birth) may count as a new name
to Sentroweb even when the name was searched before. The cost is not verified: the dialog says
"may count as a new name, at up to 1 credit each" and quotes no amount. Everything else about
credits, the cooldown and de-duplication is unchanged.

## Fuzzy search

The confirm dialog has an unticked **Fuzzy search** box. Ticking it ticks Fuzzy Search on Sentroweb
for every search of that run (the run stores `fuzzy`, shown as a badge on the Screening tab). The
answer must echo `fuzzyValue` as asked, otherwise `RESULT_MISMATCH`. Fuzzy search finds spelling
variants, so more possible matches are expected. They are all listed as **Possible match** for a
person to review; Oakcloud never dismisses a hit as a false positive by itself and never turns a
possible match into clear. Whether a fuzzy search costs a credit again is not verified; the dialog
quotes no amount.

**Not verified on the real site** (built from the recorded pages only; no live search was made for
this change): the value Sentroweb receives for a ticked gender box, whether ticking Male or Female
unticks the other, that fuzzy ticks and is echoed as `fuzzyValue`, that an option can be chosen by a
click when it is not the first listed (the recorded flow typed and pressed Enter), that a typed date
is accepted as typed without the calendar rewriting it, and whether Sentroweb charges again for a same-name search with new details.

## Error codes

Stored and shown as fixed messages (`src/lib/sentroweb/error-codes.ts`), never raw page text.

| Code | Meaning |
| --- | --- |
| `SENTROWEB_NOT_CONFIGURED` | `SENTROWEB_ENABLED` is off or a required setting is missing (HTTP 503). |
| `LOGIN_FAILED` | Sentroweb rejected the saved login. Not retried. |
| `MFA_OR_CAPTCHA_REQUIRED` | After login Sentroweb asked for a step the automation cannot do. |
| `LAYOUT_CHANGED` | A selector or the expected structure is missing. Fix `selectors.ts`. |
| `TIMEOUT` | A step, the result or the whole run took too long. |
| `SESSION_EXPIRED` | The session ended. The client logs in once more between searches, never after CONFIRM. |
| `INSUFFICIENT_CREDITS` | The balance is below the number of names. Nothing was searched. |
| `UNEXPECTED_CREDIT_COST` | The confirm box asked for something other than 1 credit; cancelled. |
| `RESULT_MISMATCH` | The two result sources disagree, one is missing, or the response is for another search. |
| `EVIDENCE_MISSING` | Sentroweb's PDF could not be saved. |
| `INTERRUPTED` | The process stopped mid-run (see Recovery). |
| `TOO_MANY_ENTITIES` | More than 10 names selected (HTTP 422). |
| `NO_ENTITIES_SELECTED` | Nothing selected (HTTP 422). |
| `COOLDOWN` | The cooldown is running (HTTP 409; `details.cooldownUntil`). |
| `ALREADY_RUNNING` | A run is queued or running for the company (HTTP 409). |
| `UNEXPECTED_ERROR` | Anything else. Details are in the server log, without page text. |

## How it runs

- `POST /api/companies/:id/sentroweb-checks` creates a `QUEUED` run with one `NOT_RUN` result per
  selected name and starts processing in the same process without waiting. A process-wide mutex
  allows one Sentroweb browser at a time.
- `processRun` claims the run with a token and a lease, opens one incognito Chrome session, searches
  the names in order and saves each result **immediately after its search**. The PDF is filed as a
  company `Document` the way e-signing files signed packages (deterministic id, `StorageKeys.documentOriginal`,
  `UPLOAD` audit by the user who ran it, `changeSource: SYSTEM`). The screenshot is stored under
  `StorageKeys.sentrowebEvidence` and is not filed.
- The session always logs out and closes Chrome in `finally`, and removes its temporary download folder.
- Chrome is started with an allow-listed environment (no Sentroweb credentials, no database URL) and
  downloads by GUID name, so the account number that Sentroweb puts in its PDF file name never
  reaches disk or logs.
- When a step fails before CONFIRM, the client logs the step name, the error code, a page label
  (`main`, `login`, `other`), short lowercase class-name tokens of the form, the length of the typed
  name and the last calls as `METHOD label status`, where the label comes from a fixed list
  (`authenticate`, `initializeApp`, `checkQuota`, `search`) and every other path is just `other`.
  No path, name, id or page text is logged.

### Recovery

The `sentroweb-check` scheduler task (every minute, inherits `SCHEDULER_ENABLED`) does two things:

1. A `RUNNING` run whose lease expired is **not resumed**. It becomes `FAILED` with `INTERRUPTED`; a
   name that was mid-search becomes `ERROR`/`INTERRUPTED` (its credit may be spent), the rest stay
   `NOT_RUN`. This never calls the Sentroweb client. A worker that is still alive but lost its run
   this way can no longer write: every result, report and audit write checks, under a row lock,
   that it still owns the run, and its uploaded files are removed.
2. A `QUEUED` run older than 2 minutes (the in-process start was lost) is started.

## Configuration

See [Environment Variables](../../reference/ENVIRONMENT_VARIABLES.md#sentroweb-check). There is no
one-time code on the shared Sentroweb login. Credentials live only in the environment; they are not
stored in the database, logs, screenshots or fixtures.

## Maintenance

Sentroweb is a third-party web app and can change without notice.

- **All selectors, paths, labels, modal texts and patterns live in `src/lib/sentroweb/selectors.ts`.**
  A test fails if any of them is copied anywhere else. When Sentroweb changes, runs end with
  `LAYOUT_CHANGED` (or a possible `TIMEOUT`), never with a clear result.
- The classification is in `src/services/sentroweb/result-parser.ts` (pure, tested with recorded
  fixtures in `__tests__/fixtures/sentroweb/`). The fixtures hold test names, Vladimir Putin and
  Rosneft only. **Never add real client names, the page header (balance, user, account), the Reports
  list, Ongoing or Manage Ongoing pages.** `fixture-hygiene.test.ts` checks for balances, tokens,
  account ids and login values.
- The browser client is `src/services/sentroweb/client.ts`; the service is
  `src/services/sentroweb/check.service.ts`.

### Tests

| Suite | Command |
| --- | --- |
| Parser, fixtures, config, UI (jsdom) | `npm run test:run` |
| Service and routes (PostgreSQL `oakcloud_test`, scripted client) | `npm run test:sentroweb:postgres` |
| Browser client against a local fake Sentroweb (needs Chrome) | `npm run test:chromium:sentroweb` |

None of these reaches the real Sentroweb. The client's real-site behaviour is verified only by the
live smoke test (test names only, at most 3 credits), which a person approves explicitly.

### Known limits

- A failed login was not observed against the real site (it would lock or waste attempts); it is
  detected as "authenticate answers 4xx" and has only been exercised against the fake.
- The export modal's markup was reconstructed from the discovery notes; the fake mirrors it.
- Scheduled re-checks, changing monitoring settings, Case Reference/TAG, per-user logins, batch
  upload and backfilling manual searches are out of scope.
