# VERIFY handoff log

## Q1 independent verification packet — VERIFY-Q1-20260912-01 — FINAL

### Scope and immutable target

- Assignment: `VERIFY-Q1-20260912-01`
- Role: independent VERIFY / G2-Q1 only
- Frozen production candidate: `6e8d4426c0d57043d85a830045dee465f6ff9a47`
- Integration PR: `#47 — codex/a4-editor-wave2-g2-integration-20260912`
- Q1 evidence PR: `#48 — verify/a4-editor-q1-20260912`
- Frozen contract: `v1 frozen at G0 — unchanged`
- Product files modified by VERIFY: **none**
- Temporary VERIFY-only GitHub Actions workflows were removed after evidence capture.

All decisive jobs checked out the frozen candidate by exact SHA, proved `git rev-parse HEAD` matched it, and overlaid only VERIFY-owned acceptance files. No application source, contract, schema, production data, package/version file, or deployment configuration was changed to obtain the result.

### Environment

- GitHub-hosted Ubuntu 24.04 runners
- Node 24
- Real Chromium installed through Playwright; production Puppeteer was bound to the installed Chromium for output verification
- Preferred Browser plugin was unavailable in this environment; the permitted real-Playwright/Chromium fallback was used
- Disposable PostgreSQL 16 container for persistence verification
- Synthetic Q1 content only; no production business records

### Decisive execution evidence

#### Browser / repeatability

Run `34691284098`, browser job `103546894711`: **SUCCESS**.

- exact frozen candidate proved before verifier overlay;
- Q1-01 native `Enter` followed immediately by typing executed in **20 consecutive fresh-process runs: 20/20 passed**;
- VERIFY boundary packet passed;
- complete frozen Q1-relevant browser baseline and delayed/fault variants passed.

Run `34693602507`, browser job `103553139068`: **SUCCESS** and independently repeated the same 20x critical sequence, boundary packet, and frozen baseline/fault variants.

#### PostgreSQL / save-reopen / batch / readers

Run `34693602507`, PostgreSQL job `103553138970`: **SUCCESS**.

The job used a disposable PostgreSQL database, applied migrations, and passed the Q1 persistence acceptance plus the frozen W1 baseline. Evidence covered save/reopen, A/B isolation, two-item batch identity/layout separation, canonical stored-document reading, old/new reader compatibility boundaries, and absence of soft-pagination metadata in persisted canonical state.

#### Q1-08 empty nested-list caret

The first combined verifier used a helper that required a `Text` node and therefore could not place a caret in the deliberate empty fixture `<p><br /></p>`. That was a verifier defect, not a product defect.

A focused verifier used a real collapsed DOM range inside the empty paragraph and executed the required native `Enter` + immediate typing sequence against the exact frozen candidate.

Run `34697297249`, browser job `103562865846`: **SUCCESS**.

Observed result: the empty nested item lifted to the parent list level, hierarchy remained valid, `Parent` was retained, and immediate typed content `LIFTED` was retained. **Q1-08 passes.**

### Q1-11 real HTML/PDF rendering — PRODUCT DEFECT

Run `34697297249`, output job `103562865715`: **FAILURE on the intended numbering assertion after real rendering**.

The verifier called the production `buildPDFHtml` and `generatePDF` paths with real Chromium. It produced and retained:

- `a4-q1-11-real-html.png`
- `a4-q1-11-real-output.pdf`
- `a4-q1-11-real-output.txt`

GitHub Actions artifact:

- name: `a4-q1-11-real-render`
- artifact id: `10298668552`
- artifact size: `95,745` bytes
- artifact digest: `sha256:d08199ea08546d2c856cd6ce22e9b1dccfcc800e1613ee5ec1973e287313974e`
- retained from run: `34697297249`

Generated PDF facts:

- actual PDF bytes: `42,061`
- pages: `4`
- first sentinel: `Q1-REAL-START-7F4A` present
- final sentinel: `Q1-REAL-END-9C2D` present on page 4
- sentinel/order and filler content remained intact across pagination

The actual output is wrong for ordered-list start/continuation semantics:

| Fixture | Required | Actual rendered HTML/PDF |
| --- | --- | --- |
| `<ol start="5">` first item | `5.` | `1.` |
| same list second item | `6.` | `2.` |
| alpha list | `a)`, `b)` | `a)`, `b)` — correct |
| bold-number list | bold marker retained | bold `1.` retained |
| continuation `<ol start="8">` | `8.` | `1.` |
| explicit restart `<ol start="1">` | `1.` | `1.` — correct |

This was confirmed three ways:

1. PDF text extraction from the real four-page PDF reported `Q1-NUMBER-FIVE 1.`, `Q1-NUMBER-SIX 2.`, and `Q1-CONTINUATION-EIGHT 1.`.
2. Visual inspection of the retained production HTML screenshot showed the same `1., 2., 1.` markers.
3. The PDF was rendered to images at 200 DPI; visual inspection of page 1 again showed `Q1-NUMBER-FIVE` as `1.`, `Q1-NUMBER-SIX` as `2.`, and `Q1-CONTINUATION-EIGHT` as `1.`. Page 4 confirmed the final sentinel and ordering.

This is therefore **not** a PDF text-extraction artifact and **not** a verifier-only failure.

The frozen print stylesheet uses a custom counter reset based on `--list-start` with a default of zero while generated HTML preserves the native `start` attribute. The observed rendering demonstrates that the native `start` value is not reaching the custom output counter for these lists. VERIFY did not change production code to correct it.

### Q1-01 through Q1-12 result map

| Check | Result | Evidence |
| --- | --- | --- |
| Q1-01 | **PASS** | 20/20 fresh-process native Enter/immediate-type repetitions; browser runs `34691284098` and `34693602507`. |
| Q1-02 | **PASS** | VERIFY browser boundary packet passed. |
| Q1-03 | **PASS** | VERIFY forward/reverse cross-page selection packet passed. |
| Q1-04 | **PASS** | Complete frozen Q1-relevant browser baseline and break-removal fault variants passed. |
| Q1-05 | **PASS** | VERIFY selected logical-position break packet passed. |
| Q1-06 | **PASS** | Complete frozen list/boundary baseline and fault variants passed. |
| Q1-07 | **PASS** | Native Tab/Shift+Tab/toolbar equivalence packet passed. |
| Q1-08 | **PASS** | Focused real-Chromium empty nested-list caret test passed, run `34697297249`. |
| Q1-09 | **PASS** | Undo/blank-page boundary packet passed. |
| Q1-10 | **PASS** | Disposable-PostgreSQL save/reopen A/B isolation acceptance passed, run `34693602507`. |
| Q1-11 | **FAIL — PRODUCT DEFECT** | Durable persistence portion passed, but actual HTML/PDF renders `start=5` as `1,2` and continuation `start=8` as `1`. |
| Q1-12 | **PASS** | Native blank-page pointer/keyboard packet passed. |

### Verifier-only false starts kept separate from the product defect

The following did not count as product failures:

- initial Q1 environment/channel setup before the temporary VERIFY workflow exception was authorized;
- early persistence verifier assumptions about canonical storage shape, corrected without production changes;
- early output-verifier class/style assumptions, corrected without production changes;
- Q1-08 helper assumption that every caret target contains a text node;
- one focused Q1-11 workflow shell-quoting error while binding Chromium;
- one focused Q1-11 default 5-second test timeout;
- one hidden artifact-directory upload configuration issue.

After those verifier-only issues were removed, Q1-08 passed and Q1-11 still failed on visible production output, establishing the product defect above.

### Defect requiring owner correction

`Q1-11-LIST-OUTPUT-01` — ordered-list native start/continuation value is lost by the custom HTML/PDF output counter path.

- Severity for gate: blocking
- Affected requirement: Q1-11 durable numbering through actual output
- Reproduction: production HTML and production PDF from exact frozen candidate
- Data/content loss: no text loss observed in this fixture; numbering semantics are wrong
- Correct cases in same fixture: alpha numbering, bold marker styling, explicit restart-at-1, sentinels/order/pagination
- Production correction by VERIFY: **none**
- Required next action: return to the appropriate implementation owner, correct the output numbering bridge/counter semantics, freeze a new candidate, then rerun Q1-11 and dependent G2/Q1 acceptance before promotion

### Cleanup / promotion boundary

- Temporary `.github/workflows/a4-q1-focused.yml`: removed after evidence capture.
- Temporary `.github/workflows/a4-q1-verify.yml`: removed after evidence capture.
- PR #47: not merged by VERIFY.
- PR #48: evidence only; not merged by VERIFY.
- No deployment or next implementation wave was started.

### Promotion decision

G2 / Q1 BLOCKED — CORRECTION REQUIRED
