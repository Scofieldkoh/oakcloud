# Company Profile Metadata Synchronization

## Goal

Keep a task's linked company and its Company Profile stage outcomes consistent, regardless of whether the user selects the company from the stage action or from Edit metadata.

## Invariant

`Task.companyId` is the authoritative linked company for the task. Every non-skipped `COMPANY_PROFILE` stage must have the same company as its linked outcome.

- Setting or replacing `Task.companyId` links the selected company to every non-skipped Company Profile stage.
- A linked Company Profile stage is completed.
- Clearing `Task.companyId` clears every non-skipped Company Profile outcome and returns those stages to `NOT_STARTED`.
- A skipped Company Profile stage remains skipped and is not given, replaced, or stripped of an outcome by metadata synchronization.
- Linking a company through a Company Profile stage continues to update `Task.companyId`, preserving the invariant in both directions.

## Server Design

One transaction-aware synchronization helper will enforce the invariant. Both task metadata updates and Company Profile stage linking will call it, so neither entry point can leave other Company Profile stages stale. The helper will use the existing task-stage status and parent-task status rules rather than duplicating status derivation in the UI.

When `companyId` is present in the metadata update payload:

1. Validate that the selected company belongs to the tenant and is active, or accept `null` for unlinking.
2. Lock the task using the existing task locking mechanism.
3. Update `Task.companyId`.
4. Find every non-skipped `COMPANY_PROFILE` stage belonging to the task.
5. For a non-null company, upsert a `COMPANY` outcome for each stage, set the stage to `COMPLETED`, preserve an existing start time, and set a completion time only when the stage newly becomes completed or changes company.
6. For `null`, delete each stage's company outcome, set the stage to `NOT_STARTED`, and clear its completion timestamp.
7. Recalculate the parent task status from all stage statuses.
8. Write audit records for the task metadata change and synchronized stage changes.

Other metadata-only edits do not reconcile Company Profile stages.

When a company is linked from an individual Company Profile stage, the same helper updates `Task.companyId` and synchronizes every other non-skipped Company Profile stage before recalculating the parent task status.

## API and UI

The existing task metadata `PATCH` endpoint and Edit task modal remain unchanged. The behavior is enforced in the service so browser actions and other API clients receive the same result.

The returned task DTO reflects the recalculated task status and synchronized stage statuses.

## Error Handling and Atomicity

Company validation, task metadata changes, outcome updates, stage transitions, task-status recalculation, and auditing occur in one transaction. If any operation fails, none of the synchronization is committed.

Existing authorization remains at the API boundary: the user must be able to update the task and the selected company. Tenant checks remain in the service.

## Tests

Regression tests will prove that:

- Selecting a company through metadata completes all non-skipped Company Profile stages and can complete the parent task.
- Replacing the metadata company replaces every applicable Company Profile outcome.
- Skipped Company Profile stages remain skipped.
- Clearing the metadata company clears applicable outcomes and returns their stages to `NOT_STARTED`.
- Updating unrelated metadata does not change Company Profile outcomes.
- A failure during synchronization rolls back the metadata and stage changes through the shared transaction.
