## Development Guidelines

**Key Principles:**
- Keep code clean, efficient, modular, reusable, and consistent
- Update documentation under `docs/` instead of creating new files
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Log unrelated errors or improvements here

## Observations

- 2026-09-10 Business Assistant continuation: the earlier e-signing and correction-service type errors are resolved in the current workspace. Full Node 24 typecheck and production build pass; the focused assistant/BizFile run passes 301 tests, PostgreSQL 22, and Chromium 5. Preserve concurrent e-signing edits when preparing commits. Remaining release gates are recorded in the implementation handover.

- 2026-09-09 Business Assistant continuation: the focused assistant/BizFile run passes 230 tests, but full Node 24 typecheck reports e-signing errors outside this change: missing `completionCopyEmails` in `esigning-list-page.tsx`, and nullable email values in `esigning-envelope.service.ts` and `esigning-pdf.service.ts`. The workspace includes concurrent e-signing edits; preserve those changes and resolve/check them with their owning work before claiming a clean full build.

- 2026-09-07 Business Assistant migration validation: applying all 64 migrations to disposable PostgreSQL 16 succeeded, but Prisma migration diff also reports pre-existing index/constraint-name and database-default differences on unrelated tables (including billing, tasks, and ACRA). Do not apply the entire generated diff as a cleanup migration; isolate assistant changes and review unrelated drift separately. Details are recorded in the existing [implementation handover](./docs/plans/2026-09-05-business-assistant-implementation.md).

- 2026-09-05 Business Assistant documentation review: this shell reports Node 22.19.0 while `package.json` requires Node 24. The five focused BizFile baseline test files passed (65 tests), but implementation/release checks must use Node 24. Follow the existing [runtime migration record](./docs/plans/2026-09-05-node-24-runtime-migration.md); no runtime change was made in this review.
