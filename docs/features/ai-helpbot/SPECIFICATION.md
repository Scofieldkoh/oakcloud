# Eden (AI Helpbot) - Feature Specification

> **Status**: Proposed
> **Version**: 0.2
> **Last Updated**: 2026-03-01
> **Audience**: Product, Engineering, Security, Operations

## Related Documents

- [Architecture](../../ARCHITECTURE.md)
- [Service Patterns](../../guides/SERVICE_PATTERNS.md)
- [RBAC Guideline](../../guides/RBAC_GUIDELINE.md)
- [API Reference](../../reference/API_REFERENCE.md)
- [Database Schema](../../reference/DATABASE_SCHEMA.md)

---

## Executive Summary

Eden is an in-app assistant panel that helps users understand, validate, and execute work inside Oakcloud. It is designed as a controlled operator assistant, not an unrestricted autonomous agent.

Official in-product bot name: `Eden`.

Production readiness requires more than chat quality. This spec defines:
1. Context-aware interaction with structured app state
2. Safe action execution with permission and confirmation gates
3. Tenant-isolated memory and files
4. Reliability, observability, and operational controls
5. A phased rollout that proves value before autonomy

---

## Problem Statement

Current workflows require users to switch between modules, internal notes, and documentation while manually applying repetitive checks and operations. This creates:
1. Rework from missed fields and inconsistent process execution
2. Slow onboarding for new users
3. High context-switch overhead
4. Uneven quality across operators

Eden addresses this by combining:
1. Live structured context from the current page
2. Grounded answers from internal documentation
3. Governed internal tools for execution

---

## Value Chain

| Stage | Input | Output | Business Value | Primary Risk | Control |
|-------|-------|--------|----------------|--------------|---------|
| 1. Intent Capture | User message + context snapshot | Parsed intent | Faster issue triage | Ambiguous prompt | Clarification prompt templates |
| 2. Context Grounding | Route, selection, form state, permissions | Work context object | Relevant responses | Stale client context | Server-side entity re-validation |
| 3. Knowledge Grounding | Docs + tenant playbooks | Cited evidence set | Correct process guidance | Outdated docs | Index freshness checks + confidence gating |
| 4. Plan Generation | Intent + context + evidence | Action plan or answer | Reduced manual planning | Unsafe/overbroad actions | Tool allowlist + policy guard |
| 5. User Approval | Proposed actions | Approved/rejected run | Human control over risk | Blind acceptance | Risk labels + plain-language diffs |
| 6. Execution | Approved plan | Run results | Time savings | Partial failures | Step-level retries + idempotency |
| 7. Verification | Action outputs + post-state checks | Completion status | Fewer silent errors | False success | Invariant checks + post-run validation |
| 8. Learning | Feedback + outcomes | Better prompts/policies | Continuous improvement | Drift/regression | Evaluations + release gates |

---

## Goals

1. Deliver contextual assistance tied to current UI state and selected entities
2. Improve process compliance and data quality through guided checks
3. Execute approved actions with strict RBAC and auditability
4. Support concurrent user sessions without memory/state leakage
5. Handle temporary agent files securely with lifecycle governance

## Non-Goals (Initial Releases)

1. Browser-level automation outside Oakcloud
2. Autonomous high-risk actions without explicit approval
3. Cross-tenant or cross-user memory sharing by default
4. Replacing module-specific workflows with generic AI-only flows

---

## MVP Scope Lock (Approved)

MVP is explicitly constrained to reduce delivery risk and stabilize core architecture.

### In Scope (MVP)

1. Module: `Companies` only
2. Capability: read-only ask/check workflows only
3. Sources: internal documentation + company module context snapshot
4. Output: guidance, validation findings, citations, navigation intents

### Out of Scope (MVP)

1. Any write/update/delete action tools
2. Background automation runs
3. Temporary file based automation
4. Cross-module actions

### Exit Criteria To Move Beyond MVP

1. Read-only quality gates pass for 2 consecutive release cycles
2. Citation and safety metrics meet thresholds in this spec
3. No unresolved tenant isolation or permission defects

---

## Personas and Jobs To Be Done

| Persona | Typical Goal | Helpbot Value |
|---------|--------------|---------------|
| Company User (Staff) | Complete assigned tasks accurately | Contextual instructions, quick validation, one-click safe actions |
| Company Admin (Manager) | Review team output and unblock work | Summaries, discrepancy detection, controlled delegation actions |
| Tenant Admin | Configure policy and risk boundaries | Tool policies, model controls, tenant quotas, audit visibility |
| Compliance Reviewer | Verify filings and evidence trails | Citation-backed answers, reproducible action logs |
| New Joiner | Learn process quickly | Step-by-step guided operation in the active module |

---

## Use Case Catalog

### UC-1: Contextual Navigation Guidance

**Trigger**: User asks how to complete a process on current page.  
**Input**: Route/module + selected company/document + active form state.  
**Output**: Step-by-step instructions, linked to current screen and citations.

Acceptance criteria:
1. Response references current module and entity correctly
2. Includes at least one doc citation when documentation is used
3. If context is insufficient, assistant asks a focused follow-up question

### UC-2: Record Completeness Check

**Trigger**: User asks assistant to check a draft record.  
**Input**: Record ID, form draft state, policy checklist.  
**Output**: Missing fields, inconsistencies, and suggested fixes.

Acceptance criteria:
1. Findings map to concrete field names
2. No write action occurs during check-only mode
3. User can apply selected fixes with confirmation

### UC-3: Policy and Documentation Q&A

**Trigger**: User asks process/policy questions.  
**Input**: Query + docs index results.  
**Output**: Answer with source citations and confidence indicator.

Acceptance criteria:
1. Citations include source path and heading context
2. Low-confidence responses explicitly state uncertainty
3. No fabricated endpoint/table names in cited mode

### UC-4: Assisted Multi-Step Action

**Trigger**: User requests a concrete action (e.g., create follow-up tasks).  
**Input**: Intent + selected entities + permissions.  
**Output**: Proposed action plan -> confirmation -> execution report.

Acceptance criteria:
1. Plan lists each intended write operation
2. High-risk operations require explicit confirmation
3. Results include per-step success/failure details

### UC-5: Temporary File Based Automation

**Trigger**: User uploads a file for transformation/checking.  
**Input**: File + requested operation + module context.  
**Output**: Derived artifact (report/CSV/JSON) with TTL-backed link.

Acceptance criteria:
1. File is scanned and validated before processing
2. TTL expiration removes access after expiry
3. Audit log records file creation and expiry

### UC-6: Parallel Sessions for One User

**Trigger**: User opens multiple Eden sessions in different tabs/modules.  
**Input**: Different `session_id` values with distinct context.  
**Output**: Isolated memory and independent run timelines.

Acceptance criteria:
1. No cross-session message bleed
2. Run state changes are scoped to owning session
3. Canceling one run does not affect others

---

## Functional Scope

### Conversation Features

1. Start/rename/archive session
2. Persist threaded message history
3. Display citations and action cards
4. Stream partial responses for long operations

### Context Features

1. Attach route/module/entity context every turn
2. Include selection and form draft hints
3. Detect stale context revisions before writes
4. Prompt for clarification when context confidence is low

### Action Features

1. Read-only tools (search/lookup/validate)
2. Write tools with confirmation and idempotency keys
3. Long-running background runs with status polling/streaming
4. Step-by-step run event log

### Navigation Features

1. Assistant can propose page navigation intents (for example, open company deadlines tab)
2. Frontend executes navigation through Next.js router, not DOM click simulation
3. Navigation can be auto-executed for low-risk read-only flows
4. Navigation to write-critical pages can require user confirmation by policy

### Memory Features

1. Rolling session memory with summarization
2. Optional pinned user facts within tenant boundaries
3. Tenant-level memory policy controls
4. Session archive and purge support

### File Features

1. Ephemeral file upload for agent workflows
2. Signed URL access only
3. TTL auto-delete with lifecycle job
4. File size/type enforcement and scanning

---

## Interaction Model

### Panel Anatomy

1. Header: Session title, context chips, status indicator
2. Timeline: User/assistant/tool/system events
3. Action cards: Proposed steps, risk label, confirm/cancel controls
4. Composer: Prompt box, quick intents, optional attachment control

### Message Types

1. `answer`: Informational response
2. `question`: Clarifying question
3. `proposal`: Suggested action plan requiring decision
4. `result`: Post-execution outcome summary
5. `error`: Recoverable/non-recoverable failure response

### Navigation Intent Contract

```ts
interface NavigationIntent {
  type: 'navigate';
  target: {
    path: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
  };
  reason: string;
  requiresConfirmation: boolean;
}
```

### Action Risk Labels

1. `LOW`: Read-only or reversible changes
2. `MEDIUM`: Standard writes with straightforward rollback
3. `HIGH`: Irreversible or externally visible actions

---

## Structured App State Visibility

The assistant must consume a typed context snapshot rather than parsing DOM text or screenshots.

### Context Snapshot Contract

```ts
export interface AIContextSnapshot {
  tenantId: string;
  userId: string;
  requestId: string;
  capturedAt: string; // ISO timestamp
  route: {
    path: string;
    module: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
  };
  scope: {
    companyId?: string;
    documentId?: string;
    workflowProjectId?: string;
    deadlineId?: string;
  };
  selection: {
    selectedIds: string[];
    activeTab?: string;
    focusedField?: string;
  };
  uiState: {
    filters?: Record<string, string | number | boolean>;
    sort?: { key: string; direction: 'asc' | 'desc' };
    pagination?: { page: number; limit: number };
    formDraft?: Record<string, unknown>;
    locale?: string;
    timezone?: string;
  };
  entityRevisions?: Array<{
    entityType: string;
    entityId: string;
    revisionToken: string; // e.g. updatedAt/version hash
  }>;
  capabilities: {
    canRead: string[];
    canWrite: string[];
    canApprove: string[];
  };
}
```

### Snapshot Rules

1. Build snapshot from router/store/server state, not from visible text scraping
2. Redact secrets/tokens/hidden PII before transmission
3. Server re-checks all entity IDs and permissions before tool execution
4. Write operations must fail closed on stale `entityRevisions`

### Stale Context Handling

1. If revision mismatch is detected, stop execution
2. Return a `context_conflict` result with required refresh action
3. Allow user to re-run with a fresh snapshot

---

## Knowledge and Retrieval (RAG)

### Sources

1. `docs/features/*`
2. `docs/guides/*`
3. `docs/reference/*`
4. Tenant-managed operational playbooks (future extension)

### Ingestion Pipeline

1. Parse markdown by heading hierarchy
2. Chunk by semantic section boundaries
3. Generate embeddings and store with metadata:
- `source_path`
- `module`
- `heading`
- `last_indexed_at`
- `doc_version`
4. Re-index on doc changes and scheduled refresh

### Retrieval Strategy

1. Query expansion from intent + module context
2. Filter by relevant module first
3. Retrieve top-K chunks, then rerank by relevance + recency
4. Inject citations into final response payload

### Grounding Policy

1. If confidence is below threshold, ask follow-up or declare insufficient context
2. Prefer internal docs over model prior knowledge
3. Do not output undocumented API/schema claims as fact

---

## Tooling and Agent Runtime

### Tool Contract (Backend)

```ts
interface AssistantTool<Input, Output> {
  name: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiredPermissions: Array<{ resource: string; action: string }>;
  requiresConfirmation: boolean;
  maxRetries: number;
  run(input: Input, ctx: ToolExecutionContext): Promise<Output>;
}
```

### Runtime Stages

1. Intent classification
2. Context and permission pre-check
3. Plan proposal (if action requested)
4. User confirmation (when required)
5. Execution with step-level logging
6. Post-run verification checks
7. Final response and audit event emission

### Guardrail Rules

1. Tool access only through backend allowlist
2. No dynamic arbitrary code execution
3. No direct SQL tool exposed to model
4. All write tools require idempotency key

---

## Connector Hard Cost Control (Required)

Hard cost control is enforced at connector layer before every model call. This prevents budget overruns even when assistant traffic spikes.

### Enforcement Scope

1. Enforcement point: connector resolver/execution middleware
2. Scope dimensions:
- per connector
- per tenant
- per operation class (optional)
3. Applies to all Eden requests, including retries and background jobs

### Connector Settings Schema (AI_PROVIDER)

Stored in `connectors.settings` JSON.

```json
{
  "costControl": {
    "enabled": true,
    "currency": "USD",
    "period": "MONTHLY",
    "timezone": "UTC",
    "hardLimitMicrosUsd": 50000000,
    "softLimitMicrosUsd": 40000000,
    "perRequestMaxMicrosUsd": 250000,
    "reserveBeforeCall": true,
    "failMode": "BLOCK",
    "fallbackConnectorId": "optional-uuid",
    "allowReadOnlyFallback": true
  }
}
```

Notes:
1. `hardLimitMicrosUsd` is a hard stop (example above = USD 50.00)
2. `perRequestMaxMicrosUsd` prevents single expensive prompts from bypassing monthly controls
3. `failMode=BLOCK` means request is rejected when limits are exceeded

### Default Model Tier Policy (Approved)

Model tiering is used to balance cost, latency, and quality.

1. `economy` tier:
- default for read-only ask/check flows
- used for MVP Companies module interactions
2. `balanced` tier:
- fallback for low-confidence read-only responses
- default for non-MVP proposal generation once enabled
3. `strict` tier:
- reserved for high-risk checks and policy-sensitive workflows
- disabled in MVP (feature-flag only)

Selection rules:
1. Start with tier mapped to operation type
2. Escalate one tier on confidence failure if cost policy allows
3. Do not escalate beyond tenant budget controls

### Runtime Budget Check (Preflight)

Before provider call:
1. Estimate request cost from token forecast and model pricing table
2. Validate estimate against `perRequestMaxMicrosUsd`
3. Reserve estimated amount (atomic) against active period budget
4. If reservation would exceed hard limit, reject with `BUDGET_EXCEEDED`

After provider response:
1. Compute actual cost from usage + pricing
2. Write `connector_usage_logs`
3. Reconcile reservation delta (`actual - reserved`)

### Concurrency Safety

To prevent race-condition overspend:
1. Use atomic reservation update in a single DB transaction
2. Track reservation records with TTL (for crashed/abandoned requests)
3. Release stale reservations via scheduled reconciliation job

### Error and UX Behavior

1. Exceeded budget returns deterministic error code: `BUDGET_EXCEEDED`
2. If configured and safe, route to cheaper fallback connector/model
3. If no fallback is allowed, show user clear next step:
- reduce request size
- wait for budget reset
- ask tenant admin to increase limit

### Audit and Metrics

Emit:
1. `AI_COST_CHECK_PASSED`
2. `AI_COST_CHECK_BLOCKED`
3. `AI_COST_RESERVATION_RECONCILED`

Track:
1. budget utilization %
2. blocked request count
3. fallback invocation count

---

## Session Memory and Context Management

Memory must improve quality without leaking data or exploding token cost.

### Memory Layers

1. **Recent Turns**: Last N user/assistant/tool messages
2. **Session Summary**: Compact rolling summary of goals, decisions, and outstanding items
3. **Pinned Facts**: User-approved preferences/facts scoped to tenant/user

### Scope and Isolation

1. Primary key: `(tenant_id, user_id, session_id)`
2. No cross-tenant memory reuse
3. No cross-user reuse by default
4. Optional shared team memory requires explicit policy and audit controls
5. Pinned memory is tenant opt-in by default in v1 (`disabled` until tenant admin enables)
6. Pinned memory enablement must be auditable (`AI_MEMORY_POLICY_UPDATED`)

### Default Retention Policy

| Memory Type | Default Retention | Notes |
|-------------|-------------------|-------|
| Recent Turns | 30 days | Session archive after inactivity |
| Session Summary | 90 days | Supports long-running tasks |
| Pinned Facts | Until removed | Explicit user/tenant control required |

### Summarization Policy

1. Refresh summary every 6 turns or when token budget threshold is crossed
2. Preserve unresolved tasks and confirmed preferences
3. Do not summarize secrets into memory stores

---

## Concurrent Sessions and Run Orchestration

### Concurrency Model

1. Session identity: `(tenant_id, user_id, session_id)`
2. Run identity: `run_id` per execution attempt
3. API layer is stateless and horizontally scalable
4. Long runs are handled by queue workers

### Run State Machine

1. `QUEUED`
2. `PLANNING`
3. `WAITING_CONFIRMATION`
4. `RUNNING`
5. `VERIFYING`
6. `COMPLETED`
7. `FAILED`
8. `CANCELLED`
9. `EXPIRED`

### Concurrency Controls

1. Idempotency keys for all write actions
2. Entity-level optimistic lock with revision token
3. Optional short mutex for conflicting operations on same entity
4. Retry policy for transient failures only

### Cancellation Semantics

1. `cancel` marks run as cancelled and stops future steps
2. In-flight step can finish if non-interruptible
3. Partial completion is reported explicitly with rollback guidance

### Compensation and Rollback Policy

Each tool must declare one rollback class:
1. `NONE`: read-only step or no state change
2. `COMPENSATABLE`: reversible with defined compensating action
3. `MANUAL`: requires operator intervention

Rules:
1. Multi-step runs are not assumed globally transactional
2. On failure at step `N`, orchestrator attempts compensation for completed prior `COMPENSATABLE` steps in reverse order
3. If compensation fails, run is marked `FAILED_COMPENSATION` and includes mandatory manual checklist
4. High-risk steps must include explicit pre/post invariants and rollback notes

### Queue Reliability, Retry, and DLQ

1. Retries: max 3 attempts for transient failures with exponential backoff (`5s`, `30s`, `2m`)
2. Non-retryable failures (validation, authorization, policy) fail immediately
3. Poison messages are moved to DLQ after retry exhaustion
4. DLQ items require explicit operator replay action; no automatic replay
5. Queue worker stores heartbeat every 15 seconds; stale jobs are recovered by coordinator

---

## Temporary File Storage for Agentic Automation

Temporary files support intermediate automation artifacts while minimizing persistence risk.

### File Lifecycle

1. Upload file to temp endpoint
2. Validate type, size, and checksum
3. Run malware/content scan
4. Store object in tenant-prefixed path
5. Generate signed URL for bounded access
6. Expire and delete via lifecycle job

### Storage Policy

1. Default TTL: 24 hours
2. Max upload size: tenant configurable (default 20 MB)
3. MIME allowlist required
4. Server-side encryption at rest
5. Metadata persisted in `ai_temp_files`

### Path Convention

`ai-temp/{tenantId}/{sessionId}/{runId}/{fileId}-{safeFilename}`

### Failure Handling

1. Scan failure -> reject file and emit audit event
2. TTL worker failure -> alert and retry
3. Signed URL abuse attempts -> rate-limit and revoke key

---

## Edge Case Matrix

| ID | Scenario | Expected Behavior | Owner |
|----|----------|-------------------|-------|
| EC-1 | User submits empty/ambiguous prompt | Ask targeted clarifying question | Assistant runtime |
| EC-2 | Context references deleted entity | Return not-found and suggest refresh | Tool layer |
| EC-3 | Permission revoked mid-session | Fail action with authorization error | RBAC layer |
| EC-4 | Stale form data at write time | Stop run, request recapture/refresh | Orchestrator |
| EC-5 | Duplicate submit due to retry | Deduplicate by idempotency key | API layer |
| EC-6 | Two runs update same record | Detect conflict, serialize or fail one | Run coordinator |
| EC-7 | Model provider timeout | Retry on fallback model within policy | LLM router |
| EC-8 | Retrieval returns low-confidence evidence | Explicit uncertainty + follow-up ask | RAG layer |
| EC-9 | Prompt injection in uploaded file | Strip instructions, treat as untrusted data | Retrieval + parser |
| EC-10 | Tool partial success | Return step-level status + remediation path | Run engine |
| EC-11 | Temp file expires during run | Fail gracefully with re-upload instruction | File service |
| EC-12 | Queue backlog spike | Backpressure + user-visible delayed state | Queue worker |
| EC-13 | Audit sink unavailable | Buffer and retry; fail closed for high-risk actions | Audit pipeline |
| EC-14 | Session opened in two browser tabs | Maintain same session timeline with message ordering | Session service |
| EC-15 | Malformed tool output JSON | Validate schema, mark step failed, no silent fallback | Tool adapter |

---

## Security, Privacy, and Governance

### Trust Boundaries

1. Frontend snapshot is untrusted input
2. Model output is untrusted until validated by backend
3. Tool handlers are enforcement points for authorization
4. Storage and retrieval layers are tenant-isolated by design

### Mandatory Security Controls

1. Enforce `requirePermission` in every tool handler
2. Require explicit confirmation for `MEDIUM` and `HIGH` risk writes
3. Redact secrets and sensitive values in logs and traces
4. Encrypt sensitive data at rest and in transit
5. Apply rate limits per tenant/user/session

### Prompt Injection Mitigations

1. Separate system policies from retrieved content
2. Treat retrieved documents and uploaded text as untrusted
3. Strip instructions that attempt policy/tool override
4. Enforce server-side tool policy regardless of model suggestion

### Data Governance

1. Tenant-scoped retention settings for sessions and messages
2. Purge APIs for session/file cleanup
3. Audit events for all message/action/file lifecycle operations
4. Per-tenant model/provider controls via Connector settings

### Privacy Lifecycle (DSAR/Deletion/Export)

1. Data subject export:
- export all Eden sessions/messages/runs for user within tenant scope
- include citations and tool result metadata with redaction policy
2. Data subject deletion:
- hard delete user-linked Eden data unless legal hold applies
- preserve compliance-required audit events with pseudonymized user identifiers
3. Retention boundaries:
- raw prompts/messages: tenant-configurable (default 90 days)
- run metadata: default 180 days
- audit events: per compliance policy (minimum 1 year recommended)
4. SLA:
- DSAR export completion <= 7 calendar days
- deletion execution <= 7 calendar days after approval
5. Verification:
- post-delete validation query must return zero active rows for deleted subject keys

### Proposed Audit Events

1. `AI_SESSION_STARTED`
2. `AI_SESSION_ARCHIVED`
3. `AI_MESSAGE_SENT`
4. `AI_MESSAGE_FAILED`
5. `AI_ACTION_PROPOSED`
6. `AI_ACTION_CONFIRMED`
7. `AI_ACTION_EXECUTED`
8. `AI_ACTION_FAILED`
9. `AI_RUN_CANCELLED`
10. `AI_TEMP_FILE_CREATED`
11. `AI_TEMP_FILE_EXPIRED`
12. `AI_TEMP_FILE_DELETED`

---

## Data Model (Proposed)

### Existing Table Reuse

Current schema already references `ai_conversations`. This spec proposes normalization for scalability and observability while supporting migration compatibility.

### New/Updated Tables

#### `ai_sessions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| tenant_id | UUID | Indexed |
| user_id | UUID | Indexed |
| title | VARCHAR(200) | Session label |
| context_type | VARCHAR(50) | `global`, `company`, `document`, `workflow` |
| context_id | UUID | Optional |
| status | VARCHAR(20) | `ACTIVE`, `ARCHIVED` |
| archived_at | TIMESTAMP | Optional |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Indexes:
1. `(tenant_id, user_id, updated_at DESC)`
2. `(tenant_id, context_type, context_id)`

#### `ai_messages`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| session_id | UUID | FK `ai_sessions` |
| tenant_id | UUID | Indexed |
| user_id | UUID | Indexed |
| role | VARCHAR(20) | `user`, `assistant`, `tool`, `system` |
| content | JSONB | Structured message payload |
| citations | JSONB | Source references |
| context_snapshot | JSONB | Redacted |
| token_usage | JSONB | Prompt/completion usage |
| created_at | TIMESTAMP | |

Indexes:
1. `(session_id, created_at)`
2. `(tenant_id, user_id, created_at DESC)`

#### `ai_runs`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| session_id | UUID | FK `ai_sessions` |
| tenant_id | UUID | Indexed |
| user_id | UUID | Indexed |
| status | VARCHAR(30) | Run state machine |
| risk_level | VARCHAR(10) | `LOW`, `MEDIUM`, `HIGH` |
| requested_tool | VARCHAR(120) | |
| plan_payload | JSONB | Proposed steps |
| input_payload | JSONB | Redacted |
| output_payload | JSONB | Redacted |
| idempotency_key | VARCHAR(120) | Unique where applicable |
| error_code | VARCHAR(80) | Optional |
| started_at | TIMESTAMP | |
| finished_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

Indexes:
1. `(tenant_id, user_id, created_at DESC)`
2. `(session_id, created_at DESC)`
3. Unique `(tenant_id, user_id, idempotency_key)` where `idempotency_key` is not null

#### `ai_run_steps`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| run_id | UUID | FK `ai_runs` |
| step_order | INT | Deterministic order |
| tool_name | VARCHAR(120) | |
| status | VARCHAR(20) | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `SKIPPED` |
| input_payload | JSONB | Redacted |
| output_payload | JSONB | Redacted |
| error_code | VARCHAR(80) | |
| started_at | TIMESTAMP | |
| finished_at | TIMESTAMP | |

Indexes:
1. `(run_id, step_order)`

#### `ai_session_memory`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| tenant_id | UUID | Indexed |
| user_id | UUID | Indexed |
| session_id | UUID | FK `ai_sessions` |
| summary | TEXT | Rolling summary |
| pinned_facts | JSONB | User-approved |
| updated_at | TIMESTAMP | |
| expires_at | TIMESTAMP | Optional |

#### `ai_temp_files`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| tenant_id | UUID | Indexed |
| session_id | UUID | FK `ai_sessions` |
| run_id | UUID | FK `ai_runs` (optional) |
| storage_key | VARCHAR(500) | Object path |
| filename | VARCHAR(255) | Original name |
| mime_type | VARCHAR(120) | |
| size_bytes | BIGINT | |
| checksum | VARCHAR(128) | |
| status | VARCHAR(20) | `ACTIVE`, `EXPIRED`, `DELETED`, `QUARANTINED` |
| expires_at | TIMESTAMP | TTL |
| created_at | TIMESTAMP | |

---

## API Surface (Proposed)

### Sessions and Messages

1. `POST /api/ai/assistant/sessions`
2. `GET /api/ai/assistant/sessions`
3. `PATCH /api/ai/assistant/sessions/:id`
4. `GET /api/ai/assistant/sessions/:id/messages`
5. `POST /api/ai/assistant/respond`

`POST /api/ai/assistant/respond` request:

```json
{
  "sessionId": "uuid",
  "message": "Check whether this draft has missing mandatory fields",
  "contextSnapshot": {},
  "attachments": [
    { "fileId": "uuid" }
  ]
}
```

Response (proposal example):

```json
{
  "type": "proposal",
  "messageId": "uuid",
  "sessionId": "uuid",
  "citations": [
    {
      "sourcePath": "docs/features/document-processing/OVERVIEW.md",
      "heading": "Requirements"
    }
  ],
  "proposal": {
    "runId": "uuid",
    "riskLevel": "MEDIUM",
    "steps": [
      { "order": 1, "tool": "validate_document_fields" },
      { "order": 2, "tool": "create_follow_up_tasks" }
    ],
    "requiresConfirmation": true
  }
}
```

### Runs

1. `POST /api/ai/assistant/runs/:id/confirm`
2. `POST /api/ai/assistant/runs/:id/cancel`
3. `GET /api/ai/assistant/runs/:id`
4. `GET /api/ai/assistant/runs/:id/events` (SSE or polling)

#### Event Ordering and Delivery Guarantees

1. Run events are emitted with monotonic `sequence` per `runId`
2. Delivery guarantee is at-least-once
3. Clients must deduplicate by `(runId, sequence)` and render ordered timeline
4. Polling endpoint returns events sorted by `sequence ASC`
5. SSE reconnect supports `Last-Event-ID` for loss recovery

### Temporary Files

1. `POST /api/ai/assistant/files`
2. `GET /api/ai/assistant/files/:id/url`
3. `DELETE /api/ai/assistant/files/:id`

---

## Non-Functional Requirements and SLO Targets

| Category | Target |
|----------|--------|
| Availability | 99.9% monthly for assistant APIs |
| Chat Latency | p95 <= 4s for read-only Q&A under normal load |
| Proposal Latency | p95 <= 8s for action proposal generation |
| Run Start Time | p95 <= 2s from confirmation to `RUNNING` |
| Data Isolation | 0 cross-tenant leakage incidents |
| Durability | 99.99% successful persistence for messages/runs |
| Audit Completeness | >= 99.9% assistant actions have audit records |
| Temp File Expiry | 99.9% files deleted within 10 min of TTL |

### Initial Scale Targets

1. 500 concurrent active sessions per deployment cluster
2. 100 concurrent run executions with queue backpressure
3. 10,000 messages/day with stable p95 latency

---

## Observability and Operations

### Metrics

1. Request metrics:
- `ai_requests_total`
- `ai_request_latency_ms`
- `ai_request_errors_total`
2. Retrieval metrics:
- `ai_rag_queries_total`
- `ai_rag_low_confidence_total`
- `ai_rag_index_age_hours`
3. Execution metrics:
- `ai_runs_total`
- `ai_runs_failed_total`
- `ai_run_step_retries_total`
4. Queue metrics:
- `ai_queue_depth`
- `ai_queue_oldest_job_age_seconds`
- `ai_dlq_total`
- `ai_dlq_replay_total`
5. Ordering/conflict metrics:
- `ai_event_out_of_order_total`
- `ai_run_conflict_total`
6. File metrics:
- `ai_temp_files_created_total`
- `ai_temp_files_expired_total`
- `ai_temp_files_quarantined_total`

### Logs and Traces

1. Structured logs with `tenantId`, `userId`, `sessionId`, `runId`, `requestId`
2. Trace span per stage: retrieval, model call, tool call, persistence
3. Redact secrets and sensitive user content by policy

### Alerts

1. Error rate > 5% for 5 minutes
2. p95 chat latency > 8 seconds for 10 minutes
3. Temp file expiry job lag > 15 minutes
4. Audit event write failures > threshold
5. Provider timeout surge beyond baseline

### Degraded Mode Behavior

When upstream dependencies are unhealthy, Eden must degrade predictably instead of failing ambiguously.

1. `RAG_UNAVAILABLE`:
- disable citation-backed answers
- return "knowledge temporarily unavailable" response template
- keep navigation intents available
2. `LLM_PROVIDER_DEGRADED`:
- switch to fallback connector/model if policy allows
- enforce stricter token and timeout caps
- disable non-essential proposal generation
3. `QUEUE_BACKLOG_HIGH`:
- block new background runs
- keep read-only chat path active
- show delayed execution status to user
4. `COST_BUDGET_EXCEEDED`:
- block request or route to allowed low-cost fallback
- show budget-specific user action guidance
5. All degraded states must emit explicit status events for UI banner display

### Operational Runbooks

1. Provider outage fallback and degradation mode
2. Queue backlog draining and admission control
3. Temp storage cleanup recovery
4. Audit sink recovery procedure

---

## Testing Strategy

### Unit Tests

1. Intent routing and policy guard logic
2. Tool input/output schema validation
3. Memory summarization and retention behavior

### Integration Tests

1. End-to-end ask/check/do workflows
2. Confirmation gate enforcement
3. Concurrent sessions and conflict handling
4. Temp file lifecycle from upload to expiry

### Security Tests

1. Prompt injection scenarios
2. Cross-tenant access attempts
3. Permission bypass attempts at tool endpoints
4. Signed URL misuse and replay attempts

### Reliability Tests

1. Load test for peak chat traffic
2. Queue backlog and worker restart scenarios
3. Fault injection for provider/network timeouts

---

## Rollout Plan and Exit Gates

### Phase 1: Read-Only Assistant

Scope:
1. Companies module only (`/companies/*`)
2. Panel UI, sessions, messages
3. Context snapshot + RAG with citations
4. Ask/check/navigation intent only
5. No write tools, no background runs, no temp-file automation

Exit gates:
1. Citation precision benchmark passes threshold
2. Low hallucination rate in curated eval suite
3. No tenant isolation defects in security tests

### Phase 2: Assisted Actions

Scope:
1. Companies module low-risk write tools only
2. Confirmation workflow and run timeline
3. Session memory and summaries

Exit gates:
1. Confirmation bypass = 0 in tests
2. Idempotency conflict handling proven under load
3. Audit completeness meets target

### Phase 3: Controlled Automation

Scope:
1. Background run orchestration
2. Temporary file workflows
3. Tenant-level autonomy policy controls

Exit gates:
1. Backpressure and queue recovery verified
2. File lifecycle SLO achieved
3. Incident runbooks validated in staging drills

---

## Change Management Implementation

This section defines how Eden stays reliable while Oakcloud is under active development and refactoring.

### Objectives

1. Prevent drift between product behavior, tool contracts, and knowledge content
2. Ship frequent changes without breaking in-flight sessions and automations
3. Detect regressions early through automated contract and quality gates
4. Preserve backward compatibility long enough for safe rollout

### Change Classes

| Class | Example | Risk Level | Required Controls |
|-------|---------|------------|-------------------|
| C1 - Content Only | Docs update, prompt wording tweak | Low | Docs lint + reindex |
| C2 - Non-Breaking Code | New optional field in tool response | Medium | Schema tests + eval run |
| C3 - Breaking Contract | Rename/remove context field or tool input key | High | Version bump + adapter + migration plan |
| C4 - Behavioral Safety | Confirmation logic, RBAC enforcement, risk policy changes | Critical | Security review + canary + rollback plan |

### Ownership Model (RACI)

| Area | Responsible | Accountable | Consulted | Informed |
|------|-------------|-------------|-----------|----------|
| Tool contract changes | Backend engineer | Module lead | QA, Security | Product |
| Context snapshot schema | Frontend engineer | Module lead | Backend, QA | Product |
| Knowledge index pipeline | Platform engineer | Engineering manager | Module leads | Support |
| Safety policy updates | Security + Backend | Engineering manager | Product, QA | Tenant admins |
| Rollout and monitoring | DevOps/Platform | Engineering manager | Feature team | Support |

### Contract Versioning Policy

1. All assistant-facing contracts must include `schemaVersion`
2. Breaking changes require a major version increment
3. Non-breaking additions require a minor version increment
4. Patch version is used for bug fixes and documentation corrections

#### Versioned Contracts

1. `AIContextSnapshot`
2. Tool input/output schemas
3. Assistant response envelope (`answer`, `proposal`, `result`, `error`)
4. Run event payloads

#### Backward Compatibility Window

1. Support `current` and `previous` major versions simultaneously
2. Minimum compatibility window: 2 release cycles
3. Remove old version only after migration completion and zero usage for 14 days

### Implementation Pattern: Adapter Layer

Use stable assistant tool names and adapt internals behind the gateway.

1. Keep external tool ID stable (`create_follow_up_tasks`)
2. Map to versioned internal handler (`create_follow_up_tasks.v2`)
3. Translate old payloads with compatibility adapters
4. Emit deprecation warnings with telemetry

### Change Workflow (Required)

1. Create change ticket with class (`C1` to `C4`)
2. Attach impact checklist:
- Affected contracts
- Affected modules/routes
- Required migration
- Knowledge/doc impact
- Rollback plan
3. Implement code + docs in same PR when possible
4. Run mandatory CI gates
5. Deploy to staging canary with synthetic eval suite
6. Promote gradually by feature flag
7. Monitor SLOs and regression dashboards
8. Close with post-release verification

### CI/CD Gates for Eden

#### Gate 1: Contract Integrity

1. Fail build if schema changed without version bump
2. Validate generated JSON schemas against fixtures
3. Verify adapter compatibility with previous major version

#### Gate 2: Safety and Permissions

1. Run tests for confirmation gate enforcement
2. Run RBAC negative tests (permission denied paths)
3. Fail build on any write tool that bypasses policy guard

#### Gate 3: Knowledge Sync

1. Detect changed docs under `docs/features`, `docs/guides`, `docs/reference`
2. Rebuild embeddings/index artifacts
3. Fail if index age is stale after doc changes
4. Validate citations point to existing files/headings

#### Gate 4: Quality Regression

1. Execute module eval suite (ask/check/do prompts)
2. Required thresholds (MVP Companies read-only):
- citation precision >= 0.90
- grounded answer accuracy >= 0.85
- unsafe action proposal rate = 0.00
- permission bypass pass rate = 1.00
- hallucinated endpoint/schema reference rate <= 0.02
3. Track score deltas from baseline
4. Block promotion when:
- any hard safety metric fails
- weighted quality score drops by > 3 percentage points
- unresolved regression count > 0 in blocker category

### Knowledge Layer Operations (KnowledgeOps)

#### Source of Truth

1. `docs/features/*` for module behavior
2. `docs/guides/*` for operational and policy guidance
3. `docs/reference/*` for API/schema truth

#### Freshness Rules

1. Every indexed chunk stores:
- `source_path`
- `heading`
- `doc_last_updated`
- `indexed_at`
- `doc_commit_sha`
2. Freshness SLO:
- doc-to-index propagation p95 <= 10 minutes after merge
- alert at > 30 minutes
- degraded mode at > 24 hours (citation-backed mode disabled)
3. Retrieval prefers newest valid chunk when relevance is similar
4. Staleness policy by source type:
- API/schema references older than 30 days -> warning banner in response metadata
- feature/guideline docs older than 90 days -> warning banner in response metadata
5. If evidence is stale and conflicts are detected, assistant asks for confirmation before procedural guidance

#### Documentation Change Hooks

1. On merged PR with docs changes:
- Trigger reindex job
- Update chunk metadata with commit SHA
- Run citation integrity tests
2. On merged PR with API/schema changes:
- Require linked docs update in same PR or explicit exception approval

#### Drift Detection

1. Daily job compares:
- API/schema signatures vs reference docs
- Route/tool inventory vs documented capabilities
2. Raise drift alerts and create TODO issues automatically

### Migration Strategy for Breaking Changes

#### Database and Message Migration

1. Use additive-first migrations:
- Add new columns/tables
- Dual-write during migration window
- Backfill historical data
- Switch read path
- Remove legacy fields after window
2. Protect with reversible migration scripts where possible

#### Session and Run Continuity

1. Existing sessions continue on old schema via adapter
2. New sessions default to latest schema
3. In-flight runs must not be invalidated by deployment
4. If unavoidable, mark impacted runs `EXPIRED` with recovery instructions

#### Legacy `ai_conversations` Migration Policy (Approved)

1. Migration mode: dual-read + dual-write for 2 release cycles
2. New writes go to normalized tables (`ai_sessions`, `ai_messages`) and mirrored to legacy during window
3. Reads prioritize normalized tables, then fallback to legacy for unmigrated sessions
4. Sunset criteria:
- legacy read share < 1% for 14 consecutive days
- zero migration blocker issues open
5. After sunset:
- disable legacy writes first
- disable legacy reads in next release
- run final backfill verification report

### Feature Flag Strategy

1. Global kill switch for Eden
2. Per-module enablement flags
3. Per-tool execution flags
4. Per-risk-level action flags (`HIGH` risk off by default in dev)
5. Per-tenant rollout cohorts (internal -> pilot -> general)

### Tenant Control Surface (Approved)

Delivery approach:
1. API-first controls in MVP
2. Minimal admin UI shipped in MVP at `Admin -> Connectors` for operational safety

Minimum MVP controls:
1. Enable/disable Eden per tenant
2. Select default connector/model tier policy
3. Configure connector hard/soft/per-request budget limits
4. View budget utilization and blocked-by-cost-control counts

### Release Readiness Checklist

1. Contracts versioned and changelog updated
2. Docs synced and index rebuilt
3. CI gates passed (contract, safety, knowledge, quality)
4. Canary telemetry stable for 24 hours
5. Rollback tested in staging

### Rollback Playbook

1. Disable affected feature flag/tool
2. Revert adapter route to previous stable version
3. Pause new run admissions if integrity risk detected
4. Preserve audit trail and run artifacts
5. Publish incident note and remediation ticket

### Key Change Management Metrics

| Metric | Target |
|--------|--------|
| Contract-breaking releases without adapter | 0 |
| Docs/API drift issues older than 7 days | 0 |
| Regressions caught in CI vs production | >= 95% caught pre-prod |
| Canary rollback success rate | 100% |
| Mean time to safely disable faulty tool | <= 10 minutes |

---

## Business Impact and Success Metrics

### Core KPIs

1. Task completion time reduction (target: >= 25% for selected workflows)
2. Manual correction rate reduction (target: >= 30%)
3. First-week onboarding productivity improvement (target: >= 20%)
4. Helpbot adoption: weekly active users / eligible users
5. Proposal acceptance rate for assisted actions
6. User-reported usefulness score by module

### Secondary KPIs

1. Citation click-through rate
2. Repeat question rate (proxy for unclear responses)
3. Action rollback rate
4. High-risk action rejection rate

---

## Decision Register

### Resolved Decisions (2026-03-01)

| ID | Topic | Decision |
|----|-------|----------|
| D-001 | MVP module scope | Companies module only |
| D-002 | MVP capability scope | Read-only ask/check/navigation only |
| D-003 | Hard cost control location | Enforced at connector layer using `connectors.settings.costControl` |
| D-004 | Degraded mode behavior | Implement explicit dependency-specific degraded states and UI signals |
| D-005 | Multi-step rollback policy | Tool-level rollback class with compensation flow and `FAILED_COMPENSATION` state |
| D-006 | Knowledge freshness | Numeric freshness SLO and stale evidence policy defined |
| D-007 | Queue failure strategy | Retry policy + DLQ with manual replay only |
| D-008 | Event ordering guarantee | Monotonic sequence per run with at-least-once delivery |
| D-009 | Privacy lifecycle | DSAR export/delete SLAs and retention boundaries defined |
| D-010 | Eval gate thresholds | Quantitative promotion thresholds defined in CI Gate 4 |
| D-011 | Pinned memory default | Tenant opt-in by default in v1; disabled unless enabled by tenant admin |
| D-012 | Default model tier policy | `economy` default, `balanced` fallback, `strict` gated (off in MVP) |
| D-013 | Legacy conversation migration | Dual-read/dual-write for 2 release cycles; sunset at <1% legacy reads for 14 days |
| D-014 | Tenant control surface | API-first with minimal admin UI in MVP (enable, model, budget, usage visibility) |

### Open Decisions

None at MVP baseline.

---

## Definition of Done (Production Baseline)

1. Functional:
- Context-aware Q&A, citations, and action proposals are operational
- Confirmation gate and run lifecycle are implemented
- Temp file lifecycle works end-to-end
2. Security:
- RBAC enforcement in every tool
- Redaction and audit controls validated
- Prompt injection controls pass red-team scenarios
3. Reliability:
- SLO targets met in staging load tests
- Backpressure and recovery runbooks validated
4. Operations:
- Dashboards and alerts live
- On-call runbooks published
5. Documentation:
- API, schema, and UI docs aligned with implementation
