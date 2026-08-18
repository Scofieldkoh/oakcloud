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

- Focused Task 12 component/browser support suite: 29 tests passed across six
  files, including canonical URL ranges, malformed URL fallback, server-backed
  filters, preference precedence, page-size persistence, lifecycle actions,
  dialog focus/escape/outside/return behavior, compact agenda caps, controlled
  month transitions, and live table-column resize persistence.
- Relevant Task 10/11 compatibility suite: 110 tests passed across exactly 12
  files. The compatibility command was:

      npm.cmd run test:run -- __tests__/services/deadline.service.test.ts __tests__/api/deadline-routes.test.ts __tests__/hooks/use-deadlines.test.ts __tests__/lib/deadline.validation.test.ts __tests__/components/service-roster.test.tsx __tests__/components/service-roster-preferences.test.ts __tests__/components/async-search-select.test.tsx __tests__/services/service-roster.service.test.ts __tests__/api/service-roster-families-route.test.ts __tests__/api/service-roster-route.test.ts __tests__/hooks/use-service-roster.test.ts __tests__/api/services-settings-route.test.ts

  It covers deadline service/routes/hooks/validation and service-roster
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

### Rereview remediation evidence — pending rereview

- The calendar now has one controlled Singapore focus-month/count source;
  URL ranges are canonical full rendered-month spans across navigation,
  preference arrival, month-count changes, responsive transitions, and
  hydration without replacement loops.
- Saved column payloads accept only known IDs, append missing defaults, clamp
  valid widths, ignore malformed/unknown fields, and always show Actions.
  CANCELLED events are read-only, at least one deadline type remains selected,
  and the non-modal event disclosure plus single-layer action dialog have
  keyboard focus containment and return behavior.
- Company alias/UEN and normalized milestone searches are server-backed;
  company/due-range deviations are actionable, pagination disables terminal
  Next controls, and table sorting/resizing exposes ARIA and keyboard cues.

The final rereview remains pending. The focused remediation suite (29 tests),
Chromium browser fixture (2 tests), exact compatibility selection (110 tests),
TypeScript check, scoped ESLint (`--max-warnings 0`, zero warnings), and diff
check are the bounded evidence for this handoff.

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
