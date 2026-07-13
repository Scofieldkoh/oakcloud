# Unicode Contact Deduplication and Merge Design

**Date:** 2026-07-14

**Status:** Approved

## Objective

Prevent avoidable duplicate contacts across every creation path, including Chinese and other non-Latin names, and provide a safe review-and-approval workflow for merging existing duplicate records.

## Current-State Findings

Contact creation is inconsistent across the application:

- Manual contact creation and company-level quick creation call `createContact` directly and do not perform duplicate detection.
- BizFile imports call `findOrCreateContact`, but that function only matches identification type/number or corporate UEN. Name-only officers and shareholders are always created again.
- Document Vault extraction attempts vendor or customer resolution, and document approval creates a corporate contact when resolution fails.
- Vendor and customer resolution normalize comparison names with ASCII-only expressions. Chinese names normalize to an empty string, cannot match aliases or contacts, and can be recreated on later document approvals.
- The database unique constraint covers tenant, identification type, and identification number, but does not protect name-only contacts or corporate UEN creation races.

Document Vault does not create a contact at initial upload. Extraction resolves an existing counterparty when possible, and approval creates the contact when no match was found. BizFile creates or reuses officer and shareholder contacts when the reviewed import is confirmed.

## Chosen Approach

Use a centralized, tenant-scoped contact identity service shared by every contact creation path. It combines deterministic identifier matching, Unicode-safe name matching, confidence scoring, learned aliases, and explicit merge recommendations.

Alternatives considered:

1. Deterministic identifiers and exact names only. This has low false-positive risk but misses safe corporate-name variants and does not produce useful review recommendations.
2. Centralized confidence scoring with strict automatic-reuse rules and approval for ambiguous matches. This is the selected approach because it prevents common duplicates while retaining human control.
3. AI- or embedding-based identity matching. This adds cost, latency, and nondeterministic behavior without enough benefit for the current scope.

## Canonical Name Normalization

The identity service produces a comparison-only `canonicalName`; display values are not rewritten by the normalizer.

Normalization must:

- Apply Unicode NFKC normalization.
- Apply locale-independent Unicode-aware case normalization.
- Collapse all Unicode whitespace.
- Remove comparison-safe punctuation and separators while preserving Unicode letters and numbers.
- Preserve Chinese characters and all other scripts.
- Normalize corporate legal suffixes only for corporate comparison variants; the original legal name remains unchanged.
- Keep individual and corporate namespaces separate.

Examples:

- `王小明`, ` 王小明 `, and full-width/spacing variants have the same canonical name.
- Punctuation-only variants of the same corporate name have the same comparison form.
- Simplified and traditional Chinese characters are not automatically converted into one another. An approved alias can make such a pair deterministic later.

## Matching Policy

All matching is tenant-scoped and excludes soft-deleted contacts unless a merge or restoration operation explicitly requests them.

### Automatic Reuse

An existing contact is reused automatically when any of these conditions holds:

1. Identification type and normalized identification number match.
2. Normalized corporate UEN matches.
3. Tenant, contact type, and canonical name match exactly, including name-only contacts.
4. A previously approved vendor, customer, or contact alias resolves deterministically to the contact.
5. A corporate legal-suffix variant passes the strict high-confidence corporate-name rule.

Automatic reuse is prohibited when both records contain conflicting non-empty identification numbers or corporate UEN values.

When multiple existing contacts satisfy the same high-confidence name rule, the service selects the recommended master deterministically using the master-selection policy below for new links. It also returns the complete duplicate group for review; it does not silently merge the existing records.

### Recommendations Only

The following conditions create recommendations but never merge automatically:

- Near or fuzzy name matches.
- Simplified/traditional Chinese variants without an approved alias.
- Exact names with conflicting strong identifiers.
- Other high-similarity records for which the automatic-reuse rule is not satisfied.

Short Chinese names are not automatically matched through fuzzy similarity because a one-character difference can identify a different person. Exact canonical Chinese name matches remain eligible for automatic reuse.

### Master Selection

The recommended master is selected in this order:

1. A record with a valid, non-conflicting identification number or corporate UEN.
2. The record with more populated identity fields and contact details.
3. The record with more company, document, and workflow relationships.
4. The oldest record as a stable final tie-breaker.

The reviewer may choose a different master before approval.

## Shared Creation Flow

The centralized identity service is used by:

- Manual contact creation.
- Company-level quick contact creation.
- BizFile officer and shareholder creation in both existing-company and new-company confirmation paths.
- Document Vault vendor creation for accounts-payable documents.
- Document Vault customer creation for accounts-receivable documents.

Each creation request follows this flow:

1. Validate and normalize identifiers and the canonical name.
2. Acquire a short PostgreSQL transaction-scoped advisory lock derived from tenant, contact type, and canonical name or strong identifier.
3. Recheck matching contacts inside the transaction.
4. Reuse the deterministic match or create one new contact.
5. Return confidence, matching reasons, and any reviewable duplicate group.
6. Preserve or learn approved aliases where the existing vendor/customer workflow requires them.

This lock prevents simultaneous document approvals or imports from creating the same canonical contact concurrently.

## Persistence and Backfill

Add a nullable `canonicalName` field to `Contact` and an index covering tenant, contact type, deletion state, and canonical name. New and updated contacts always populate it.

Backfill existing contacts in bounded batches through the application normalizer so the stored value exactly matches runtime behavior for every script. The backfill is idempotent and reports processed, updated, skipped, and failed counts.

The migration does not add a unique name constraint because different people or companies can legitimately have the same name and existing duplicates must remain deployable. Existing duplicate groups are resolved through review.

Rejected recommendations are stored as tenant-scoped pair decisions using stable, sorted contact IDs. A rejection suppresses the same pair until one record's identity fields or canonical name changes, at which point the pair becomes eligible for recalculation.

## Duplicate Review Experience

The Contacts page adds a `Review duplicates` action. It opens a responsive review workflow ordered by descending confidence.

Each group shows:

- Confidence and the reasons for the recommendation.
- Names, aliases, identifiers, addresses, nationality, and birth date.
- Contact details and linked companies.
- Counts of officer, shareholder, charge, note, document, alias, and workflow references.
- Identifier conflicts that block approval.
- The recommended master and controls to choose another master.

The reviewer may approve the merge, reject the recommendation, or leave it pending. Conflicting non-empty fields are presented for explicit selection. Non-empty master fields are retained by default; missing master fields are filled from duplicates.

The interface uses existing Button, Modal, confirmation, responsive card, table, toast, and permission patterns from the design guidelines. Interactive controls meet the existing mobile touch-target and keyboard-accessibility requirements.

## Merge Transaction

Approval recalculates the recommendation and verifies tenant, permission, record versions, deletion state, and identifier conflicts immediately before mutation.

One database transaction:

1. Applies the approved field selections to the master.
2. Reassigns or consolidates `CompanyContact` rows without violating the company/contact/relationship unique constraint.
3. Reassigns `CompanyOfficer`, `CompanyShareholder`, and `CompanyCharge` references.
4. Reassigns and consolidates contact details while preserving primary and purpose metadata.
5. Reassigns note tabs, workflow communication entries, and workflow milestone approval contacts.
6. Updates document revision `vendorId` and `customerId` values.
7. Updates vendor and customer alias `normalizedContactId` values.
8. Soft-deletes duplicate contacts and marks them inactive.
9. Writes audit records containing the master, merged IDs, field decisions, moved relationship counts, matching reasons, and approving user.

Soft-deleted duplicates remain traceable. A merge does not physically delete source records or their audit history.

## Error Handling and Safety

- A merge is atomic. Any validation, relationship, or database error rolls back all changes.
- A stale recommendation is recalculated before approval, and the UI asks for review again if material inputs changed.
- Conflicting strong identifiers block approval until the reviewer explicitly selects or clears the correct value.
- Cross-tenant candidates and mutations are rejected.
- A failed review request remains open and displays a recoverable error.
- Creation-path matching failures do not silently bypass identity controls. They return an actionable error and leave the transaction unchanged.
- Exact high-confidence reuse does not imply automatic merging of already duplicated records.

## API and Service Boundaries

The implementation separates responsibilities:

- A pure Unicode normalization module owns canonicalization.
- A pure scoring module owns match reasons, confidence, conflict detection, and master ranking.
- A contact identity service owns tenant-scoped lookup, advisory locking, reuse, and creation.
- A duplicate recommendation service owns grouped discovery and rejected-pair suppression.
- A merge service owns preview validation and the merge transaction.
- Thin API routes own authentication, permission checks, validation, and response mapping.
- Contact hooks and review components own client state and presentation.

Vendor and customer resolution retain their alias behavior but delegate name normalization and direct-contact scoring to the shared modules.

## Permissions and Auditing

Reading recommendations requires contact read access. Approving or rejecting recommendations requires contact update access. Merge operations also verify access to every affected tenant-scoped record.

Creation, reuse, recommendation rejection, and merge approval produce auditable events using existing audit infrastructure. Audit metadata records whether a contact was created, reused by identifier, reused by name, resolved by alias, or merged after approval.

## Test Strategy

### Unit Tests

- NFKC and full-width normalization.
- Chinese, Latin, and mixed-script names.
- Unicode whitespace and punctuation variants.
- Corporate legal-suffix variants.
- Simplified/traditional Chinese remaining distinct until aliased.
- Exact name-only automatic reuse.
- Short Chinese fuzzy-match safeguards.
- Identifier conflict detection.
- Deterministic master ranking.
- Rejected-pair invalidation when identity data changes.

### Service and Integration Tests

- Manual creation and company quick creation use the identity service.
- Both BizFile confirmation paths reuse Chinese name-only contacts.
- Document Vault extraction resolves without creating, and approval reuses or creates exactly one corporate contact.
- Accounts-payable vendor and accounts-receivable customer paths behave consistently.
- Simultaneous approvals result in one canonical contact.
- Tenant and permission boundaries are enforced.
- Existing vendor/customer aliases remain functional with Unicode names.
- Backfill is batched and idempotent.

### Merge Tests

- Every contact relationship is moved or consolidated correctly.
- Document revision IDs and alias pointers are updated.
- Conflicting company relationships do not violate uniqueness.
- Field selections and missing-field enrichment are applied.
- Source records are soft-deleted only after all references move.
- Audit metadata is complete.
- Any forced failure rolls back the whole merge.
- A stale recommendation cannot be approved without recalculation.

### Component and Browser Tests

- Recommendation list and confidence reasons render correctly.
- Recommended and alternate master selection works.
- Conflicting fields require explicit resolution.
- Approval, rejection, pending state, error recovery, and query invalidation work.
- Keyboard navigation, focus management, and responsive mobile presentation follow the design guidelines.

## Documentation Updates

Update the existing documentation index and relevant contact/database/API references under `docs/` to describe canonical names, creation-path reuse, recommendation review, merge behavior, permissions, and backfill operation. Do not create documentation outside `docs/`.

## Out of Scope

- Fully automatic fuzzy merging.
- Transliteration-based automatic identity matching.
- Automatic simplified/traditional Chinese conversion.
- Cross-tenant contact matching or merging.
- Physical deletion of merged contacts.
- AI or embedding-based matching.
