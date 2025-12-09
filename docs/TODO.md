Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time.

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing.

----

## COMPLETED (v0.9.31):

### Service Module Refactoring (December 2024)
1. **BizFile Service Split** - Fully split `bizfile.service.ts` (2000+ lines) into clean modules:
   - `src/services/bizfile/types.ts` - Type definitions and entity mappings
   - `src/services/bizfile/extractor.ts` - AI vision extraction
   - `src/services/bizfile/normalizer.ts` - Data normalization
   - `src/services/bizfile/diff.ts` - Diff generation
   - `src/services/bizfile/processor.ts` - Database updates
   - `src/services/bizfile/index.ts` - Clean barrel exports

2. **Type Consolidation** - Removed duplicate types from hooks:
   - `use-companies.ts` now imports from `@/services/company/types`
   - Shared `CompanyWithRelations`, `CompanyStats`, `CompanyLinkInfo` types

3. **Test Fixes** - Fixed RBAC tests with missing `hasAllCompaniesAccess` field

----

## COMPLETED (v0.9.30):

### Security Improvements (December 2024)
1. **Query Parameter Validation** - Created `src/lib/validations/query-params.ts` with reusable Zod schemas
2. **Safe Logger Migration** - Auth routes now use `createLogger()` with `safeErrorMessage()` pattern
3. **X-Forwarded-For Validation** - Added `isValidIp()` and `sanitizeForwardedIp()` in `request-context.ts`

----

## COMPLETED (v0.9.29):

### UI/Accessibility Improvements (December 2024)
1. **Dark Mode Colors** - Fixed hardcoded colors in `alert.tsx`, `globals.css` page-break, `date-input.tsx`
2. **Focus Ring Standardization** - Consistent `focus:ring-2 focus:ring-oak-primary/30 focus:ring-offset-2` pattern across all form components
3. **Accessibility** - Added `aria-label` to icon-only buttons, `aria-pressed` to RichTextEditor toggle buttons
4. **Shared Variants** - Created `src/components/ui/variants.ts` for shared variant configs (alert, toast, confirm-dialog)

### Testing Framework
5. **Vitest Setup** - Added Vitest with React Testing Library (`npm run test`, `test:run`, `test:coverage`)
6. **Initial Tests** - Created `__tests__/lib/rbac.test.ts` and `__tests__/lib/utils.test.ts`

### Error Handling
7. **Safe Error Logging** - Added `safeErrorMessage()` and `sanitizeError()` helpers in `src/lib/logger.ts`

----

## COMPLETED (v0.9.28):

### Security Fixes (December 2024)
1. **Share Password Security** - Moved password from query string to POST body via `/api/share/[token]/verify` endpoint
2. **Audit Log Permissions** - Fixed `canAccessAuditLogs()` to deny access for non-admin users
3. **CSRF Protection** - Added middleware with origin validation for state-changing requests
4. **TenantId Validation** - SUPER_ADMIN tenantId parameter now validated before use

### Database Optimizations
5. **Indexes Added** - Composite indexes on UserRoleAssignment and DocumentShare for performance

### Code Quality
6. **Placeholder Types** - Consolidated duplicate type definitions into `src/types/placeholders.ts`

----

## TO DO:

### SECURITY (HIGH PRIORITY)
- [x] **Query Parameter Validation** - Created `src/lib/validations/query-params.ts` with reusable schemas (applied to `tenants/[id]/users/route.ts`)
- [x] **Migrate console.error** - Pattern established; auth routes migrated. Remaining ~45 routes can follow pattern in `auth/login/route.ts`
- [x] **Rate Limiting** - X-Forwarded-For now validated with `isValidIp()` and `sanitizeForwardedIp()`

### CODE ORGANIZATION (HIGH PRIORITY)
- [x] **Split Large Services** - Full module split (no backward-compatible re-exports):
  - `bizfile.service.ts` → `src/services/bizfile/` (types.ts, extractor.ts, normalizer.ts, diff.ts, processor.ts, index.ts)
  - `document-generator.service.ts` → `src/services/document-generation/` (types.ts, interfaces.ts, implementations.ts, index.ts)
  - `company.service.ts` → `src/services/company/` (types.ts + index.ts)
- [x] **Type Deduplication** - Removed duplicate types from hooks, import from shared service types

### TESTING (HIGH PRIORITY)
- [x] **Test Framework** - Vitest configured with React Testing Library
- [x] **Critical Path Tests** - Expanded test coverage:
  - `__tests__/lib/auth.test.ts` - JWT verification (5 tests)
  - `__tests__/lib/rbac.test.ts` - RBAC permission resolution (3 tests)
  - `__tests__/lib/request-context.test.ts` - IP validation, user agent parsing (21 tests)
  - `__tests__/lib/utils.test.ts` - Utility functions (5 tests)
  - `__tests__/services/document-validation.test.ts` - Section extraction (9 tests)

### UI/ACCESSIBILITY
- [x] **Dark Mode** - Fixed hardcoded colors (uses CSS variables now)
- [x] **Focus Ring** - Standardized focus ring pattern across components
- [x] **Accessibility** - Added aria-labels and aria-pressed attributes
- [x] **Variant Config** - Created shared variant configuration (`src/components/ui/variants.ts`)

### DOCUMENTATION
- [x] **API Reference** - Documented all 83 API endpoints in `docs/API_REFERENCE.md`
- [x] **Services Guide** - Documented service layer patterns in `docs/SERVICES.md`
- [x] **Hook Documentation** - Added JSDoc comments to key hooks (`use-auth.ts`, `use-companies.ts`)

----

## EXISTING ISSUES:

### Roles/Users
- [ ] Role permission granularity still has issues

### System-wide
- [ ] Backup of database

### Companies
- [ ] Company details > edit don't have address
- [ ] Details page doesn't have home currency
- [ ] Internal note tab container increase height
- [ ] Shareholder not showing the percentage
- [ ] Company structure differentiate private limited and exempted private limited
- [ ] Audit log for internal note is not informative enough
- [ ] Upload bizfile, paid-up capital was wrong, it should extract from bizfile, not some mathematic formula
- [ ] Shareholder's identification number not shown in company detail page
- [ ] Upload bizfile preview should normalize already

### Connectors
- [ ] Ensure connector for OneDrive is working

### Documents
- [ ] Document should be encrypted with 512SHA/AES-512
- [ ] Mobile friendliness
- [ ] Document generation - save draft to pause
- [ ] Templates-partials/document generation - remove page number
- [ ] Letterhead issues
- [ ] Share button >> format issue, comment issue, notification issue
- [ ] Comment notifications not implemented (`document-comment.service.ts:642`)

----

## PLANNED FUNCTIONALITY:
- [ ] KYCCDD Module
- [ ] URL shortener
- [ ] E-signature
- [ ] Salesrooms
