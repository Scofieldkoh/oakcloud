# Task 12 report — deadline table/calendar views and preferences

Status: implementation-complete / pending rereview

## Scope delivered

- Added a shared `Deadline filters` toolbar with Statutory, Client, Internal,
  Open only, and adjacent clickable service-family chips. It does not render a
  `Filter families` label.
- Added URL-backed deadline state for `deadlineView`, `from`, `to`, `types`,
  `families`, `companies`, `openOnly`, `origin`, `sortBy`, `sortOrder`, and
  `page`; explicit URL values take precedence over versioned preferences.
- Added the `services.deadlines.view.v1` schema/parser with defensive fallback,
  responsive month-count defaults, persisted one/two/three-month overrides,
  and persisted table presentation settings.
- Added a server-paginated DTO-backed deadline table with semantic badges,
  alternating rows, family accents, mobile cards, column resize persistence,
  and accessible row actions.
- Added a date-fns and React DayPicker calendar with Singapore date-only
  semantics, keyboard-accessible month grids/events, family colour plus text,
  `+N more`, full event details/notes/source/cycle popovers, and selected-day
  agenda support for compact viewports.
- Extended the Services workspace with URL-addressable Services and Deadlines
  tabs while Billing retains its existing placeholder until Plan 3.
- Hardened the media-query hook for test/SSR environments without
  `window.matchMedia`.

## TDD and verification evidence

### RED

Before the Task 12 production modules existed, this focused command failed
because the deadline workspace/calendar imports were absent:

    npm.cmd run test:run -- __tests__/components/deadline-workspace.test.tsx __tests__/components/deadline-calendar.test.tsx
    FAIL — failed to resolve deadline-workspace and deadline-calendar imports

### GREEN

- Focused Task 12 component suite: 19 tests passed across four files,
  including canonical URL ranges, malformed URL fallback, server-backed
  filters, preference precedence, page-size persistence, lifecycle actions,
  dialog focus/escape/outside/return behavior, compact agenda caps, and live
  table-column resize persistence.
- Relevant Task 10/11 compatibility suite: 113 tests passed across 12 files,
  including deadline service/routes/hooks/validation and service-roster
  preference/facet/security behavior.
- Chromium browser fixtures: 2 tests passed in
  `__tests__/browser/services-deadlines.browser.test.tsx`.
- `npx.cmd tsc --noEmit --pretty false`: PASS.
- Scoped ESLint over Task 12 source/tests: PASS, 0 warnings.

### Independent review remediation — pending rereview

- Canonical Singapore focus-month ranges now drive both URL-backed views;
  responsive desktop month defaults, persisted one/two/three-month overrides,
  navigation, and Today all reset the page and update `from`/`to` together.
- Malformed, partial, reversed, overlong, and invalid UUID/date query values
  are discarded before strict hook input; explicit URL filters remain ahead
  of versioned preferences. Company, service, milestone, type, due-range,
  status, source, and family controls stay in one unlabeled toolbar and use
  server-backed query state.
- Saved table columns now cover chooser visibility/order, live resize and
  debounced race-safe persistence, family row accents, supported page sizes,
  mobile cards, and paginated DTO results. Lifecycle writes are gated by both
  edit permission and the deadline-write feature flag, with required inputs,
  pending/error feedback, and accessible action dialogs.
- Loading, retryable error, filtered/unfiltered empty, family-facet error,
  calendar truncation, and compact agenda states are distinct; event cues
  include family/type/timing/lifecycle text and full source identity.

No repository-wide suite, baseline/full build, full lint, live database, or
migration gate was run; those remain deferred to the integrated Plan 2 gate.

## Boundary and residual review

- Both views consume the Task 11 `DeadlineOccurrenceDto`; no client-side
  deadline truth is fabricated. Company aliases use the backend DTO label and
  event popovers retain the full legal name.
- DayPicker owns focus/month keyboard navigation; custom day cells keep event
  controls reachable and expose `+N more` as a real button. Family colours are
  accents only; labels, badges, and lifecycle text remain visible in both
  semantic themes.
- Independent rereview should confirm exact approved mockup spacing and final
  action semantics. Prisma/live PostgreSQL and full performance acceptance
  remain intentionally deferred.
