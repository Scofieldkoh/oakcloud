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
   names. It shows how many Sentroweb credits the run will use (1 per name) and says that each name
   is added to Sentroweb ongoing monitoring.
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
| Inputs | Name plus the Individual/Entity tick only. Fuzzy matching off; no country or date of birth (`SENTROWEB_SEARCH_OPTIONS`). Sentroweb has no UEN or ID field, so UEN and ID numbers are Oakcloud metadata only. |
| Who is screened | The company (Entity), current `DIRECTOR`, `MANAGING_DIRECTOR`, `ALTERNATE_DIRECTOR`, `NOMINEE_DIRECTOR` officers and current shareholders. Corporate holders are searched as Entities. Secretaries, the CEO and former officers are not screened. The same person in several roles is one search: records match when they share a contact, or an ID type and number, or (for records without either conflicting) the same name and kind. Groups are joined repeatedly, so a later record that links two earlier groups merges them all (contact or ID number first, then name). Two records with different ID numbers or different contacts are never merged by name, so a name-only record joins exactly one person. |
| Classification | **Clear** only if the captured search response and the page's `<Category> [N matches]` titles both show 0 for every expected category (Entity: SIE; Individual: FATF, PEP, SIP), no other array in the response holds anything, the response describes the search we submitted, and the two sources agree. Any count above 0 in either source is a **Possible match**. Everything else is an **Error**. No path defaults to Clear (`src/services/sentroweb/result-parser.ts`). |
| Evidence | A Clear result needs Sentroweb's PDF. Without it the result is an Error (`EVIDENCE_MISSING`). A Possible match without the PDF stays a Possible match and carries `EVIDENCE_MISSING`. |
| Overall result | Any Possible match, otherwise anything Error/Not run or a failed run is **Incomplete**, otherwise **Clear**. |
| Run limits | At most 10 names, one active run per company (database-enforced), 10-minute cooldown unless `force`. The cooldown follows any run that spent or may have spent credits, including an interrupted run whose in-flight search was submitted; only a run known to have submitted nothing (for example a failed login) is exempt. A run stops after any error except a missing PDF, because searching on after a layout change or an unexpected credit cost would spend credits on results we cannot read. |

### Side effects on Sentroweb

- **Credits:** 1 per confirmed search. The client checks the balance before the first search and
  fails with `INSUFFICIENT_CREDITS` without searching. The confirm box must say exactly
  "1 credit(s)"; otherwise the client clicks CANCEL and records `UNEXPECTED_CREDIT_COST`.
  Exporting the PDF appeared free in discovery (balance unchanged), but that was inferred from the
  balance only.
- **Ongoing monitoring:** every Sentroweb search adds the name to the account's ongoing monitoring,
  as the team's manual searches already do. The search form offers no way to turn that off, and the
  Sentroweb Settings menu was not explored. Oakcloud never opens *Manage Ongoing Monitoring* and
  never clicks Match Yes/No, "All results are false match", Save or Cancel on a result.
- **A submitted search is never submitted again** by the client, the service or recovery.

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
