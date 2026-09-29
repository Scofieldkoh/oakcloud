## Development Guidelines

**Key Principles:**
- Keep code clean, efficient, modular, reusable, and consistent
- Update documentation under `docs/` instead of creating new files
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Log unrelated errors or improvements here
## Known Unrelated Issues

- A cold `tsc --noEmit` needs about 5.2 GB of heap, above Node's default limit, so `npm run typecheck` now runs tsc with `--max-old-space-size=8192` (the same limit as the CI build step). (2026-09-26)
- Vitest runs in `Asia/Singapore` time so date assertions match the firm's time zone. (2026-09-27)
- Several PostgreSQL integration suites fail on main before any test runs: `deadline-reconciliation`, `deadline-remediation`, `schedule-reconciliation-concurrency` and `deadline-rule-archive-concurrency` create a `DeadlineRule` whose `currentVersionId` points at a version not yet inserted (FK `deadline_rules_current_version_id_fkey`); `billing-reconciliation` builds an isolated schema from migrations only up to billing provenance, so the current client cannot read it; `service-agreement-activation` "rejects every impossible client-service source/reference combination" expects P2004 but gets a driver adapter error. (2026-09-27)
- In a full `vitest run` on a busy box, `company-create-workspace` ("renders enum-backed profile fields as searchable dropdowns") and `oaktree-service-agreement-reference` ("writes long dates, the term in words and the effective date fallback") can fail under load but pass when run alone. (2026-09-28)
- In `company-compliance-monitoring.postgres.test.ts`, "names services whose engagement start is after a YA filed on the Deadlines page" can fail about one run in four with "Deadline occurrence was changed by another user": an earlier `listDeadlines` call starts a background reconciliation that bumps `updatedAt`. It passes on re-run. (2026-09-29)
