# Task 2 report — company display-label rules

## Summary

Implemented the company display-label domain. Stored aliases are trimmed and
blank values become `null`; display-label fallback derives meaningful initials
after removing legal suffixes, including the required `OACS` result. Alias
values are carried through company create/update/detail/search responses and
company identity profile reads/writes without deriving or persisting fallback
labels.

## Files changed

- `src/lib/company-display-label.ts`
- `src/lib/validations/company.ts`
- `src/lib/validations/company-profile.ts`
- `src/services/company/types.ts`
- `src/services/company/profile-sections.ts`
- `src/services/company.service.ts`
- `__tests__/lib/company-display-label.test.ts`
- `__tests__/services/company.service.test.ts`
- `__tests__/services/company-profile-sections.test.ts`

## TDD commands and results

RED runs:

- `npm.cmd run test:run -- __tests__/lib/company-display-label.test.ts` — exit 1; failed to resolve the missing `@/lib/company-display-label` module.
- `npm.cmd run test:run -- __tests__/services/company.service.test.ts` — exit 1; 20 passed, 2 failed for missing create/update alias persistence.
- `npm.cmd run test:run -- __tests__/services/company-profile-sections.test.ts` — exit 1; 2 passed, 1 failed for missing identity alias projection/mutation.
- `npm.cmd run test:run -- __tests__/services/company.service.test.ts` — exit 1; 22 passed, 2 failed for untrimmed detail/search aliases.

GREEN runs:

- `npm.cmd run test:run -- __tests__/lib/company-display-label.test.ts` — exit 0; 4 tests passed.
- `npm.cmd run test:run -- __tests__/services/company.service.test.ts` — exit 0; 24 tests passed.
- `npm.cmd run test:run -- __tests__/lib/company-display-label.test.ts __tests__/services/company.service.test.ts __tests__/services/company-profile-sections.test.ts` — exit 0; 3 files, 31 tests passed.
- `git diff --check` — exit 0.

## Commit

- `6388e9b` — `feat: add company service display aliases`

## Compliance notes

- `src/lib/company-display-label.ts` exports exactly `normalizeCompanyAlias`,
  `deriveCompanyInitials`, and `getCompanyDisplayLabel`.
- Alias validation is capped at 40 characters for create/update and identity
  profile sections.
- Company relation selects include `displayAlias`; boundary serializers spread
  existing DTO fields and normalize only the stored alias.
- Identity profile versions include the alias, and profile mutations preserve an
  omitted legacy alias while normalizing explicitly supplied values.
- No company UI/BizFile behavior, family colors, admin auth/pages, deadlines,
  or billing behavior was implemented.

## Concerns

- The focused service tests retain existing mock warnings from task integration:
  `TypeError: Cannot read properties of undefined (reading 'findMany')` while
  reconciling task outcomes; all focused assertions still pass.
- The narrowly adjacent company-create workspace test has one unrelated
  pre-existing failure: it cannot find the `switch` named `Is current`; no UI
  files were changed for Task 2.
- The repository-wide suite was intentionally not run per the implementation
  plan.
