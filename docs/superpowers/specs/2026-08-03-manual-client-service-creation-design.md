# Manual Client Service Creation Design

**Date:** 2026-08-03

**Scope:** Allow authorized users to add an operational service manually from the Service Catalog on a company detail page, without generating a Service Agreement first.

## Goals

- Add catalog-backed services directly from the Companies detail page's Services tab.
- Keep manually entered services clearly distinct from services activated from signed agreements.
- Reuse the existing operational service editing, archiving, audit, search, filtering, and pagination behavior.
- Warn when a likely duplicate exists while allowing an authorized user to confirm and continue.
- Preserve workspace isolation, catalog validation, and atomic persistence.

## Non-Goals

- Creating free-form services that are not linked to the Service Catalog.
- Generating a synthetic or hidden Service Agreement for manual services.
- Changing signed agreement content or the agreement activation workflow.
- Automatically refreshing existing operational services when the catalog changes.
- Preventing duplicates after the user explicitly confirms the warning.

## Data Model

`ClientService` gains a required `source` field backed by a `ClientServiceSource` enum:

- `AGREEMENT` identifies services created by signed agreement activation.
- `MANUAL` identifies services created directly from the company Services tab.

The field defaults to `AGREEMENT` so existing records and the migration remain backward compatible.

`agreementId` and `agreementItemId` become nullable. An agreement-created service must have both values, while a manual service must have neither. `serviceVariantId` remains required for both sources so every operational service retains a catalog identity. Application services enforce these source invariants on creation; agreement activation continues to populate both agreement references.

The existing unique constraint on `(agreementItemId, companyId)` remains the idempotency boundary for agreement activation. PostgreSQL permits multiple rows containing a null `agreementItemId`, so confirmed manual duplicates remain possible. A supporting lookup index covers the duplicate query by workspace, company, catalog variant, start date, and archive state; it is not unique because confirmed duplicates are valid.

`ClientServiceFeeLine.sourceAgreementFeeLineId` is already nullable. Manual fee rows leave it null.

## Manual Creation API

`POST /api/companies/{companyId}/services` creates a manual operational service. The route requires `company:update` for the target company and derives the workspace and actor from the authenticated session.

The request contains:

- `serviceVariantId`
- `status`
- `serviceCadence` and optional custom cadence label
- `startDate` and optional `endDate`
- operational field values
- one or more fee rows
- `confirmDuplicate`, defaulting to `false`

Service and family labels are not trusted from the client. The server loads the active, non-archived catalog variant and its active, non-archived family in the current workspace, then snapshots their names into `serviceName` and `familyName`. The server rejects a variant outside the workspace, an inactive or archived variant or family, invalid dates, invalid cadence details, or invalid fees.

The client uses the selected catalog variant to prefill cadence, service fields, and fee templates for convenience. The submitted operational values may be adjusted before creation. Catalog fee templates without a default amount require the user to enter a valid amount; the form never silently invents a commercial amount.

The `ClientService`, its fee rows, and a `CREATE` audit event commit in one serializable transaction. The audit record identifies the catalog variant and manual source, summarizes fees without exposing operational field values, and uses the authenticated actor and company.

## Duplicate Warning Contract

A likely duplicate is any non-archived Client Service in the same workspace and company with the same `serviceVariantId` and `startDate`, regardless of source or status.

When `confirmDuplicate` is false and a match exists, the API returns HTTP `409` with a stable `DUPLICATE_CLIENT_SERVICE` code and a minimal duplicate summary containing the existing service ID, displayed service name, start date, status, and source. It does not create or audit a new service.

The modal displays the warning and keeps all entered values. The user may cancel or choose **Add anyway**. Confirming resubmits the same values with `confirmDuplicate: true`. The server still repeats authorization, catalog, validation, and transaction checks, but it bypasses only the duplicate warning. A normal stale or concurrent retry without confirmation continues to receive the warning.

## User Interface

The Services tab displays an **Add service** action when the user has edit permission. The same action appears in the empty state. Read-only users do not see it.

Selecting the action opens an Add Service modal. The form provides:

- an active Service Catalog selector;
- status;
- cadence and conditional custom cadence label;
- required start date and optional end date;
- catalog-derived service fields;
- one or more editable fee rows with description, amount, currency, frequency, optional custom frequency label, and optional billing start date.

Choosing a catalog service replaces the catalog-derived defaults in the new-service form. If the user has already modified populated fields or fees, changing the selection requires confirmation before discarding those values. The form follows the existing modal, validation, mobile touch-target, and accessible error-message patterns in the design guide.

The existing editor becomes a shared operational-service form where practical, while create-only catalog selection and edit-only archive/conflict behavior remain in their respective wrappers. This avoids maintaining two divergent copies of fee, field, cadence, and date validation.

After creation, the list query is invalidated and the modal closes. Agreement-created cards retain their Service Agreement link. Manual cards render an **Added manually** source label instead. Both kinds use the same Edit action and archive flow.

## DTO And Query Behavior

`ClientServiceDto` exposes `source`. Its agreement summary becomes nullable. Agreement services return the existing document title, status, activation status, generated document ID, and link; manual services return `agreement: null`.

List, detail, update, archive, search, status filtering, pagination, optimistic editing, and fee serialization remain common to both sources. Query includes use an optional agreement relation so manual rows can be mapped without special secondary queries.

## Error Handling

- Unauthorized creation returns the existing permission error before any mutation.
- An unavailable or cross-workspace company or catalog item returns a not-found response without revealing its existence.
- Validation errors return field-addressable HTTP `400` responses.
- A likely duplicate returns the structured HTTP `409` response described above.
- Database or audit failure rolls back the service and fee rows.
- If a catalog item becomes inactive or archived while the modal is open, the form remains open and explains that another catalog service must be selected.
- Existing optimistic `updatedAt` conflicts continue to apply only to edits after creation.

## Testing

Test-first coverage will include:

1. Prisma schema and migration contract tests for the source enum, nullable agreement relationships, preserved agreement uniqueness, and duplicate lookup index.
2. Validation tests for required catalog variant, dates, cadence details, fee rows, and `confirmDuplicate` defaulting.
3. Service tests proving workspace-scoped catalog lookup, server-owned labels, catalog default handling, manual source persistence, null agreement references, atomic fee and audit creation, and rollback behavior.
4. Duplicate tests proving the exact matching key, exclusion of archived rows, HTTP `409` behavior without mutation, and successful confirmed creation.
5. API tests for `company:update`, not-found isolation, validation, structured duplicate responses, and success.
6. Component tests for permission-gated Add Service actions, catalog prefilling, required amounts, validation accessibility, duplicate confirmation, query invalidation, and manual-versus-agreement source rendering.
7. Regression tests proving agreement activation still creates `AGREEMENT` services idempotently and existing edit/archive flows work for both sources.

## Documentation And Operational Compatibility

The approved implementation will update the existing architecture and service-pattern documentation to state that operational services may originate from either signed agreement activation or explicit manual catalog entry. Backup export, restore, and tenant cleanup continue to use the same Client Service tables; their tests will be updated for nullable agreement references and the new source field. Generated Prisma artifacts will be refreshed through the repository's existing generation command.

## Acceptance Criteria

- An authorized user can add an active catalog service from a company's Services tab without generating an agreement.
- Catalog selection prefills operational details and the user can adjust them before saving.
- The created card is immediately listed and labeled **Added manually**.
- A matching company, catalog variant, and start date produces a warning before creation.
- Choosing **Add anyway** creates the duplicate; cancelling creates nothing and preserves the form until it is closed.
- Agreement-created services retain their agreement links and activation behavior.
- Manual services can be edited and archived through the existing workflows.
- Cross-workspace, inactive, archived, invalid, or unauthorized inputs do not create partial records.
