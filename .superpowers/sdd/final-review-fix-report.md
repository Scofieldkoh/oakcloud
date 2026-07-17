# Final Whole-Branch Review Fix Report

## Scope completed

1. Shared preview/generation rendering now analyzes the expanded template,
   including nested partials, and rejects omitted required singular party IDs
   with the established request-validation messages. Template-editor test mode
   remains able to render mock/context-override data. Final persistence is not
   reached after these validation errors.
2. `selectedContactId` now populates only `selectedContact`; legacy `contact`,
   `contacts`, and `custom.contacts` remain sourced from legacy `contactIds` or
   explicit context overrides.
3. Structured address components now determine `letter` whenever present.
   A supplied normalized `fullAddress` remains `full`; otherwise a plain
   one-line `full` value is constructed from structured components.
4. The wizard Company step now blocks singular-party templates without a
   company and exposes an accessible `Select a company for this template.`
   alert. Legacy-contact-only templates retain the optional-company behavior.
5. Validation receives the trusted authenticated session name and reports
   preparer placeholders available only for a non-empty trusted name. Client
   custom data cannot supply system preparer identity.

The existing document-party resolver was not weakened or replaced. Its tenant,
company-membership, current-record, active/deleted, and contact-union checks
remain in place, and focused security tests continue to pass.

## TDD evidence

### RED

Initial failing regression run:

```text
npm test -- --run __tests__/lib/document-party.test.ts __tests__/services/document-generator.service.test.ts __tests__/components/document-generation-wizard.test.tsx __tests__/services/document-validation.test.ts __tests__/api/generated-documents-validation-route.test.ts
Exit code: 1
Test Files: 5 failed (5)
Tests: 14 failed, 56 passed (70)
```

Expected failures demonstrated all five missing behaviors: structured address
precedence/full preservation, shared singular selection enforcement, selected
contact/legacy independence, Company-step blocking, and trusted preparer
availability/route threading.

The final-persistence fixtures were then corrected so their RED failure was the
missing validation rather than unrelated missing mocks:

```text
npx vitest run __tests__/services/document-generator.service.test.ts -t "does not persist final generation"
Exit code: 1
Test Files: 1 failed (1)
Tests: 3 failed, 15 skipped (18)
Failure: each generation promise resolved with unexpected-document instead of rejecting.
```

This confirmed that all three omitted singular IDs allowed persistence before
the production fix.

### GREEN

First focused green run after the minimal implementation:

```text
npx vitest run __tests__/lib/document-party.test.ts __tests__/services/document-generator.service.test.ts __tests__/components/document-generation-wizard.test.tsx __tests__/services/document-validation.test.ts __tests__/api/generated-documents-validation-route.test.ts
Exit code: 0
Test Files: 5 passed (5)
Tests: 70 passed (70)
Duration: 4.28s
```

Expanded focused regression/security run:

```text
npx vitest run __tests__/services/document-party.service.test.ts __tests__/services/document-generator.service.test.ts __tests__/services/document-generator-party-loops.test.ts __tests__/services/document-validation.test.ts __tests__/lib/template-analysis.test.ts __tests__/lib/placeholder-resolver.test.ts __tests__/lib/document-party.test.ts __tests__/components/document-generation-wizard.test.tsx __tests__/api/generated-documents-workspace.test.ts __tests__/api/generated-documents-validation-route.test.ts __tests__/api/generated-documents-preview-route.test.ts
Exit code: 0
Test Files: 11 passed (11)
Tests: 104 passed (104)
Duration: 6.25s
```

This expanded run covers the unchanged secure party resolver, recursive
template analysis, legacy party loops, placeholder resolution, shared renderer,
validation service/route, preview/create routes, address utility, and wizard.

## Required full verification

```text
npx tsc --noEmit
Exit code: 0
Duration: 73.6s
```

```text
npx eslint src/services/document-generator.service.ts src/services/document-validation.service.ts src/lib/document-party.ts src/app/api/generated-documents/validate/route.ts src/components/documents/document-generation-wizard.tsx __tests__/services/document-generator.service.test.ts __tests__/services/document-validation.test.ts __tests__/lib/document-party.test.ts __tests__/api/generated-documents-validation-route.test.ts __tests__/components/document-generation-wizard.test.tsx
Exit code: 0
```

```text
git diff --check
Exit code: 0
```

```text
npm run test:run
Exit code: 0
Test Files: 126 passed (126)
Tests: 995 passed (995)
Duration: 89.81s
```

The full suite emits the existing intentionally exercised
`CounterpartyIdentityValidationError` diagnostic from
`document-revision-route.test.ts` to stderr; there are no failed tests.

Production build used process-scoped build-only values for `DATABASE_URL`,
`DATABASE_SSL=false`, `JWT_SECRET`, `ENCRYPTION_KEY`, and disabled scheduler
flags; no environment file was written:

```text
npm run build
Exit code: 0
Prisma Client generated successfully.
Next.js compiled successfully in 59s.
Static pages generated: 131/131.
Total command duration: 196.4s.
```

The build reports the existing multiple-lockfile/output-tracing-root warning
for the main checkout and isolated worktree. It does not affect the successful
build result.

## Self-review

- Confirmed changes are confined to the isolated
  `codex/document-party-placeholders` worktree.
- Confirmed no generated Prisma files or build artifacts appear in the diff.
- Confirmed no client-supplied preparer field is accepted into system context.
- Confirmed singular enforcement is in the shared renderer used by preview and
  generation and runs before generated-document persistence.
- Confirmed legacy `contact.*`, `contacts` loops, and singular-free templates
  remain selection-optional.
- Confirmed API and database reference documentation matches runtime behavior.
- Final `git diff --check` exits 0.
