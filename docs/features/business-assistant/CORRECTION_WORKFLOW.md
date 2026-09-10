# Business Assistant BizFile Correction Workflow

> **Updated:** 2026-09-10  
> **Status:** Implemented as the P12 deterministic-field correction flow; broader P12 review and release gates remain open  
> **Related:** [Business Assistant Specification](./SPECIFICATION.md) · [Implementation Handover](../../plans/2026-09-05-business-assistant-implementation.md) · [API Reference](../../reference/API_REFERENCE.md#business-assistant-endpoints)

## Purpose

The correction workflow lets a user turn factual findings from the latest independent BizFile review into a new canonical proposal without rewriting the original operation, approval, receipt, or review.

A correction is **not** a direct edit. The UI submits only the reviewed expected value from an allowlisted finding. The server prepares a new linked run/item/proposal, and the user must review and approve that proposal through the normal Business Assistant confirmation flow before stored company data can change.

## Entry conditions

The correction panel is shown only for the latest review on a `bizfile.import_and_review` item when the source item is already committed and its lifecycle is one of:

- `NEEDS_REVIEW`
- `PASSED`
- `PASSED_WITH_WARNINGS`

The backend independently enforces the same committed/latest-review requirements together with ownership, fresh workspace/resource authorization, restore/dispatch policy, source evidence, receipt bindings, and current company/source revisions. UI visibility is convenience only; it is not an authorization boundary.

## Supported findings and fields

Only these review finding codes are eligible:

- `SELECTED_FIELD_MISMATCH`
- `PERSISTED_FIELD_MISSING`
- `APPROVED_FIELD_MISMATCH`

Supported deterministic paths are defined once in `src/lib/bizfile-correction-contract.ts` and consumed by both the UI and the server correction preparer. The current UI presents 26 scalar or one-to-one paths across:

- Entity details
- Primary and secondary SSIC activity
- Financial year and compliance dates
- Home currency and capital totals
- Registered and mailing addresses
- Auditor

Collection-row corrections remain intentionally unsupported, including officers, shareholders, charges, share-capital rows, and former-name rows. Those require a separate identity-aware correction contract.

## Selection and request limits

A correction proposal may contain **1 to 20** findings. `BIZFILE_CORRECTION_MAX_ITEMS` in `src/lib/bizfile-correction-contract.ts` is the shared source of truth for both the UI limit and request validation.

When 20 corrections are selected, the remaining unselected checkboxes are disabled until the user deselects one. The UI never sends more corrections than the API accepts.

The reviewed correction value is immutable from this panel. The user selects findings, but cannot replace the independent review's `expected` value with arbitrary input.

## Request contract

`POST /api/business-assistant/runs/:id/corrections`

```json
{
  "workspaceId": "current-workspace-id",
  "clientRequestId": "stable-idempotency-key",
  "reviewId": "latest-review-id",
  "corrections": [
    {
      "findingId": "factual-finding-id",
      "value": "exact-reviewed-expected-value"
    }
  ]
}
```

The UI generates a stable `clientRequestId` for the same review plus selected-finding set. Repeating the identical request can therefore recover the existing proposal instead of creating another one. Reusing the request ID with different content is rejected as a conflict.

The response contains the linked correction proposal identity:

```json
{
  "correction": {
    "kind": "CORRECTION_PROPOSAL",
    "correctionOfReviewId": "source-review-id",
    "sourceRunId": "source-run-id",
    "runId": "new-run-id",
    "runItemId": "new-run-item-id",
    "proposalId": "new-proposal-id",
    "revision": 1,
    "duplicate": false
  }
}
```

No new operation ID exists at preparation time. The normal `CONFIRM` flow allocates the operation identity after the new proposal is explicitly approved.

## Server-side integrity checks

The BizFile correction preparer validates, among other things:

- requested finding exists in the selected latest review;
- finding code and factual path are allowlisted;
- submitted value exactly matches the immutable review `expected` value;
- each factual path appears at most once;
- source proposal, approval, prepared-item bindings, receipt and operation identity still match;
- committed source evidence and retained bytes still match their SHA-256 binding;
- the source document pointer is still the original or legitimate finalized pointer;
- review coverage/snapshot remains bound to the committed source and company revision;
- current document and company permissions still allow the correction;
- current company baseline has not changed after the source review;
- the corrected reviewed data still satisfies the canonical BizFile schema;
- the requested factual correction still produces a canonical change.

Any stale or mismatched condition blocks preparation rather than silently rebasing the old approval.

## User experience

The correction panel shows the recorded value beside the reviewed correction and explains that creating a proposal does not immediately change company data.

After submission:

- a newly created proposal reports that a new approval card has been added;
- an idempotent replay reports that the existing proposal was recovered;
- changing the selection clears stale success/error feedback;
- structured values render in valid block markup;
- each correction checkbox has an explicit accessible label.

After a proposal is created or recovered, the user must use the normal Business Assistant approval card to review and confirm it.

## Implementation map

| Area | File |
|---|---|
| Shared allowlist, finding codes, request limit | `src/lib/bizfile-correction-contract.ts` |
| Eligible finding presentation metadata | `src/components/business-assistant/correction-fields.ts` |
| Correction selection and proposal UI | `src/components/business-assistant/correction-panel.tsx` |
| Review-card entry and lifecycle gating | `src/components/business-assistant/run-card.tsx` |
| Client mutation hook and response validation | `src/hooks/use-business-assistant.ts` |
| Generic correction request validation | `src/lib/validations/business-assistant.ts` |
| Generic proposal service | `src/services/business-assistant/correction.service.ts` |
| BizFile correction preparation | `src/services/bizfile/application/prepare-correction.ts` |
| Correction-field contract tests | `__tests__/components/business-assistant-correction-fields.test.ts` |

## Remaining work

This implementation completes the deterministic-field **UI entry and shared-contract presentation** portion of P12. It does not close all P12 or release work.

Remaining correction/review work includes identity-aware collection-row corrections, a full real-storage/real-BizFile correction execution test including rollback and same-source lifecycle preservation, moving retained-source network reads out of the authorization transaction into an authorized prefetch/revalidation design, full-state/unselected-write review comparison, annotated reviewer-quality evaluation, and the later P13-P16 operational/release gates.

## Verification record

PR #16 completed ten review → fix → commit cycles after the initial implementation commit. The review sequence hardened contract parity, stale UI feedback, idempotent replay messaging, structured markup/accessibility, committed-state gating, shared client/server correction definitions, and the 20-item request limit.

For the final merge candidate, Node 24 lint, typecheck, Chromium path tests, Business Assistant/BizFile contract tests, PostgreSQL recovery/authorization tests, and the production-image compatibility job passed before the first Next build attempt. That Next build compiled successfully but exhausted Node's default ~4 GB heap during validation. The CI workflow was then aligned with the repository's already documented successful-build requirement by setting an 8 GB heap for the Next build step. Final merge is gated on the rerun.
