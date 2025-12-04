# Changelog

All notable changes to Oakcloud are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Added `canAccessCompany()` authorization check to document upload POST handler (`src/app/api/companies/[id]/documents/route.ts`)
- Added company-level permission verification in bulk delete operation (`src/app/api/companies/bulk/route.ts`)
- Enforced tenant context in `findOrCreateContact()` to prevent cross-tenant data leakage (`src/services/contact.service.ts`)

### Changed
- **Breaking:** UEN uniqueness is now scoped per tenant instead of globally. Companies in different tenants may share the same UEN.
- Shareholder percentage recalculation now wrapped in database transaction to prevent race conditions (`src/services/company.service.ts`)
- Officer removal now uses soft delete (marks as ceased) instead of hard delete (`src/app/api/contacts/[id]/route.ts`)
- Shareholder removal now uses soft delete (marks as ceased) instead of hard delete (`src/app/api/contacts/[id]/route.ts`)

### Added
- Added `deletedAt` field to `CompanyContact` model for soft delete support
- Added `onDelete: SetNull` behavior for `contactId` in `CompanyOfficer` and `CompanyShareholder` models - prevents orphaned records when contacts are deleted
- Added audit logging for `unlinkContactFromCompany()` operation (`src/services/contact.service.ts`)
- Added duplicate prevention for officer/shareholder linking - prevents same contact being added twice in same role (`src/services/contact.service.ts`)
- Added `useUnsavedChangesWarning` hook for form pages (`src/hooks/use-unsaved-changes.ts`)
- Added unsaved changes browser warning to company create/edit forms
- Added unsaved changes browser warning to contact create/edit forms
- Added `aria-expanded` and `aria-controls` accessibility attributes to filter toggle buttons (`src/components/companies/company-filters.tsx`, `src/components/contacts/contact-filters.tsx`)

### Fixed
- Fixed financial year end day validation to respect month-specific day limits (e.g., Feb max 28/29) (`src/services/company.service.ts`)
- Fixed missing cessation > appointment date cross-validation for officers (`src/services/company.service.ts`)
- Fixed contact validation to include phone format, corporate UEN format (9-10 alphanumeric), and DOB validation (not future, not >150 years old) (`src/lib/validations/contact.ts`)
- Fixed contact relationships endpoint to filter out deleted companies (`src/services/contact.service.ts`)
- Updated search placeholder text to accurately reflect searchable fields (`src/components/companies/company-filters.tsx`, `src/components/contacts/contact-filters.tsx`)

### Database Schema Changes
- Added `deleted_at` column to `company_contacts` table
- Added index on `company_contacts.deleted_at`
- Changed `company_officers.contact_id` foreign key to SET NULL on delete
- Changed `company_shareholders.contact_id` foreign key to SET NULL on delete
- Removed global unique constraint on `companies.uen`, now only unique per tenant via compound index `(tenant_id, uen)`

---

## [0.9.10] - 2024-12-04

Initial documented version.
