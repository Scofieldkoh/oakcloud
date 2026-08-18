# Task 11 report — deadline query and lifecycle APIs

## Scope

Implemented bounded deadline search/list schemas, SQL-scoped table/calendar
DTOs, Singapore date-only timing derivation, lifecycle and override mutations,
auditing, API routes, and React Query hooks.

## TDD evidence

### RED

Before production modules existed:

```text
npm.cmd run test:run -- __tests__/services/deadline.service.test.ts
FAIL — Failed to resolve import "@/services/deadline"

npm.cmd run test:run -- __tests__/services/deadline.service.test.ts __tests__/api/deadline-routes.test.ts __tests__/hooks/use-deadlines.test.ts
FAIL — deadline service, API routes, and hook modules were absent
```

### GREEN

Focused Task 11 suite:

```text
20 tests passed across 3 files
__tests__/services/deadline.service.test.ts
__tests__/api/deadline-routes.test.ts
__tests__/hooks/use-deadlines.test.ts
```

Direct compatibility suite:

```text
40 tests passed across 4 files
__tests__/services/service-roster.service.test.ts
__tests__/api/service-roster-route.test.ts
__tests__/hooks/use-service-roster.test.ts
__tests__/api/services-settings-route.test.ts
```

Additional gates:

```text
npx.cmd tsc --noEmit                         PASS
npx.cmd eslint src/lib/validations/deadline.ts src/services/deadline src/app/api/deadlines src/hooks/use-deadlines.ts  PASS (0 warnings)
```

## Implementation notes

- List predicates carry `tenantId`, accessible company IDs, date range, family,
  type, status/open-only, timing, and origin filters into Prisma query inputs;
  no tenant-wide result set is loaded for application-side filtering.
- Calendar mode fetches one row beyond the 5,000 response cap, omits page
  semantics, and emits `truncated` plus a warning when the cap is exceeded.
- `UPCOMING`, `DUE`, and `OVERDUE` are derived from open operative dates and the
  current Singapore civil date; the value is never persisted.
- User mutations use `updateMany` with tenant, expected `updatedAt`, and a
  non-cancelled predicate. Zero rows produce `VERSION_CONFLICT`; cancelled rows
  produce `OCCURRENCE_IMMUTABLE` and are never written.
- Explicitly clearing every deadline-type filter returns an empty result, and
  direct Completed↔Waived transitions are rejected; route Zod/JSON validation
  returns structured 400 responses.
- Date overrides preserve calculated dates. Reset clears all override metadata
  and copies the calculated date to the operative date.
- Audit records include before/after status and date values, reason, notes
  metadata, company, and actor. The occurrence schema has no notes column, so
  optional notes are retained in audit metadata rather than written to an
  unsupported field.
- List routes require `company:read`, the services workspace feature gate, and
  the session-derived company scope. Detail/mutation routes load the occurrence
  (and Company relation) before checking `company:read`/`company:update`.
- React Query keys canonicalize set-like filters and mutation success
  invalidates deadline lists, the specific deadline, and roster summaries.

## Assumptions and risks

- `CANCELLED` is system-only per the domain contract and is therefore excluded
  from the PATCH schema; reconciliation remains responsible for cancellation.
- `notes` cannot be persisted on `DeadlineOccurrence` because the accepted
  Task 1 Prisma model intentionally has no notes field; audit metadata is the
  compatible storage path until a later additive model change.
- Calendar truncation uses a `take: 5001` probe so exactly 5,000 results are
  distinguishable from a larger set.
- Full baseline/full build/full lint, Prisma migration execution, and live
  PostgreSQL tests remain deferred to the integrated Plan 2 gate as recorded in
  the progress ledger.
