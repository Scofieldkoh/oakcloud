# Task 10 report — Services roster review remediation

Status: remediation-complete / awaiting rereview

Implementation commit: `5d6d7f6`

## Scope delivered

- Routed Company, Family, and Service inline filters through canonical URL state and the accepted Task 9 roster search contract as `companyQuery`, `familyQuery`, and `serviceQuery`. Prisma predicates, next-deadline SQL, totals, pagination, React Query keys, and transport parsing remain tenant/access scoped.
- Added a company-read, workspace-gated operational family-facet endpoint at `/api/client-services/families` and a stable abort-aware hook. Facets are deduplicated from all non-archived accessible client services and do not depend on the current roster page or administrator-only catalog access.
- Replaced the first-page-only Add flow with the existing server-scoped `/api/companies/options` search/page contract through `useCompanyOptionsPage` and `AsyncSearchSelect`; typed search, zero-based paging, `hasMore`, and accessible-company predicates remain server-owned.
- Made `services.roster.table.v1` a defensively parsed versioned preference containing widths, order, visibility, sort, and page size. Added accessible column visibility/order controls and resize-end/debounced width persistence while URL state remains authoritative for shareable filters, sorting, and pagination.
- Changed roster state to derive from `useSearchParams`, with optimistic URL updates for responsive controls and synchronization when browser Back/Forward changes the address bar. Family badges retain semantic foreground text and use configured colours only for border/dot accents.

## TDD and verification evidence

- RED: canonical inline contract tests failed because the Task 9 schema rejected the three fields and the hook dropped them; the family facet route/hook tests failed with missing modules; the remote company hook test failed because only the first-page hook existed; the preference parser/control test failed because the complete contract and controls were absent; roster tests failed for page-only family options, local inline filtering, and stale navigation state.
- GREEN: Task10 correction suite — 12 files / 60 tests passed.
- Accepted Task9/shared regression suite — 12 files / 112 tests passed.
- Chromium Services Admin + Company Services suite — 2 files / 4 tests passed.
- `npm.cmd exec -- tsc --noEmit --pretty false` — pass.
- Scoped ESLint over touched Task10 source/tests with `--max-warnings 0` — pass with zero warnings/errors.
- `git diff --check` — pass.

## Boundary coverage

- Canonical inline filters are serialized, normalized, server-predicated, page-resetting, and included in truthful totals; next-deadline SQL includes the same fields.
- Family options are complete and deduplicated across accessible operational records even when the visible roster page contains only another family; empty access scopes return no facet query.
- Company search includes typed query, page, limit, `hasMore`, and Next/Previous behavior; the Add dialog mounts the shared creator only after a selected accessible company.
- Preference restore defensively handles unknown columns/invalid widths/version, preserves default columns/actions, and covers order, visibility, sorting, page size, and resize-end persistence.
- Browser navigation updates request state from URL changes; family text remains semantic and colour-independent.

## Assumptions and residual risks

- Family facets intentionally describe non-archived operational client services, including ended services, rather than the administrator-only catalog. Families with no operational client-service record are not offered as roster filters.
- Company option paging uses the existing zero-based `/api/companies/options` contract with its server-side company-read predicate; no client tenant parameter is trusted for scope.
- Repository-wide baseline/full build/full lint, Prisma generation/migrations, live database tests, and plan-level performance tests remain deferred to the plan-level gate.
- This correction is awaiting the independent Task10 rereview; no Task11 work was started.

## Changed files

- `src/lib/validations/service-roster.ts`
- `src/services/service-roster/{service,types,index}.ts`
- `src/app/api/client-services/families/route.ts`
- `src/hooks/{use-service-roster,use-service-roster-families,use-all-company-options}.ts`
- `src/components/services/roster/{service-roster,service-roster-table,add-client-service-dialog}.tsx`
- Focused Task10/service-roster/family/options/component tests.
- This report and the SDD ledger entry.
