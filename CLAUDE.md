## Development Guidelines

**Key Principles:**
- Keep code clean, efficient, modular, reusable, and consistent
- Update documentation under `docs/` instead of creating new files
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Log unrelated errors or improvements here
## Known Unrelated Issues

- A cold `tsc --noEmit` needs about 5.2 GB of heap, above Node's default limit, so `npm run typecheck` now runs tsc with `--max-old-space-size=8192` (the same limit as the CI build step). (2026-09-26)
- These component suites already fail on `main` and are not run in CI: billing-table, business-assistant-bizfile-upload, company-create-workspace, deadline-calendar, deadline-review-remediations, deadline-rules-admin, document-table, esigning-detail-hydration, esigning-list-actions, esigning-step-upload, form-url-health-field-warning, service-roster and template-editor/template-validation. (2026-09-26)
