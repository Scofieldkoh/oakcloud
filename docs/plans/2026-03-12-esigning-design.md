# E-Signing Module Design

> **Created**: 2026-03-12
> **Status**: Approved
> **Phase**: 1 — Core E-Signing (Templates & Agreement Management planned for later phases)

## Overview

A standalone e-signing module for Oakcloud, enabling accounting firms to send documents to external clients for electronic signature. Inspired by DocuSign's envelope system and workflow, with Dropbox Sign's cleaner certificate design.

### Key Decisions

- **Standalone module** — documents are uploaded directly into the e-signing workflow, not coupled to Generated Documents
- **Envelope model** — multiple documents packaged into a single envelope with one link/email per signer
- **Client-side PDF rendering** — pdf.js (via react-pdf) with React overlay for field placement and signing
- **Coordinate-based field positioning** — percentage-based coordinates stored in DB, decoupled from rendering
- **Per-document certificates** — Dropbox Sign-style visual timeline appended to each signed PDF
- **Certificate ID watermark** — stamped on every page of every document

---

## 1. Data Model

### 1.1 Envelope

The top-level transaction entity.

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| tenantId | UUID | Multi-tenancy |
| createdById | UUID | Sender (FK to User) |
| title | String | Envelope name (defaults to first document name) |
| message | Text? | Message to all recipients |
| status | Enum | DRAFT, SENT, IN_PROGRESS, COMPLETED, VOIDED, DECLINED, EXPIRED |
| signingOrder | Enum | PARALLEL, SEQUENTIAL, MIXED |
| accessMode | Enum | EMAIL_LINK, EMAIL_WITH_CODE, MANUAL_LINK |
| accessCode | String? | Hashed PIN for EMAIL_WITH_CODE mode |
| expiresAt | DateTime? | When the envelope expires |
| reminderFrequencyDays | Int? | Days between auto-reminders |
| reminderStartDays | Int? | Days after send before first reminder |
| expiryWarningDays | Int? | Days before expiry to warn sender |
| companyId | UUID? | Optional FK to Company for auto-filing signed docs |
| certificateId | String | Unique ID stamped on every page (format: `OAK-ES-YYYYMMDD-XXXXXXXX-XXXX`) |
| completedAt | DateTime? | When all signers finished |
| voidedAt | DateTime? | When voided |
| voidReason | Text? | Why it was voided |
| metadata | JSONB | Extensible data |
| createdAt | DateTime | Created timestamp |
| updatedAt | DateTime | Last modified |
| deletedAt | DateTime? | Soft delete |

### 1.2 EnvelopeDocument

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| envelopeId | UUID | FK to Envelope |
| fileName | String | Original file name |
| storagePath | String | MinIO/S3 path to original PDF |
| signedStoragePath | String? | Path to final signed PDF (populated after completion) |
| pageCount | Int | Number of pages |
| sortOrder | Int | Display order within envelope |
| fileSize | Int | File size in bytes |

### 1.3 DocumentField

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| documentId | UUID | FK to EnvelopeDocument |
| recipientId | UUID | FK to EnvelopeRecipient (who fills this field) |
| type | Enum | SIGNATURE, INITIALS, DATE_SIGNED, NAME, TEXT, CHECKBOX, COMPANY, TITLE |
| pageNumber | Int | Which page (1-indexed) |
| xPercent | Float | X position as % of page width (0-100) |
| yPercent | Float | Y position as % of page height (0-100) |
| widthPercent | Float | Width as % of page width |
| heightPercent | Float | Height as % of page height |
| required | Boolean | Must be filled before signing |
| label | String? | Optional label shown to signer |
| placeholder | String? | Placeholder text for text fields |
| value | Text? | Filled value (signature stored as storage path or data URL) |
| filledAt | DateTime? | When this field was filled |
| sortOrder | Int | Tab order for guided signing navigation |

**Extensibility note**: New field types (dropdown, radio, attachment, formula) can be added to the type enum and given a corresponding renderer without changing the schema.

### 1.4 EnvelopeRecipient

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| envelopeId | UUID | FK to Envelope |
| type | Enum | SIGNER, CC |
| name | String | Recipient name |
| email | String | Recipient email |
| signingOrder | Int? | Position in sequence (null = parallel with others at same position) |
| status | Enum | PENDING, SENT, VIEWED, SIGNED, DECLINED |
| accessToken | String | Unique token for signing URL (crypto random, 64 chars) |
| accessCode | String? | Per-recipient hashed PIN (optional override) |
| signedAt | DateTime? | When they completed signing |
| viewedAt | DateTime? | First view timestamp |
| declinedAt | DateTime? | When declined |
| declineReason | Text? | Why they declined |
| signedIp | String? | IP address at signing (audit) |
| signedUserAgent | String? | Browser info at signing (audit) |
| lastReminderAt | DateTime? | When last reminder was sent |
| colorTag | String | Assigned color for field placement UI |

### 1.5 EnvelopeEvent (Audit Trail)

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| envelopeId | UUID | FK to Envelope |
| recipientId | UUID? | FK to EnvelopeRecipient (null for sender actions) |
| action | Enum | CREATED, SENT, VIEWED, SIGNED, DECLINED, VOIDED, CORRECTED, COMPLETED, REMINDER_SENT, EXPIRED |
| ipAddress | String? | Actor's IP |
| userAgent | String? | Actor's browser |
| metadata | JSONB | Additional context (correction details, decline reason, etc.) |
| createdAt | DateTime | When event occurred |

### 1.6 Envelope Lifecycle State Machine

```
DRAFT → SENT → IN_PROGRESS → COMPLETED
                    ↓
                 DECLINED
         ↓
       VOIDED
                    ↓
                 EXPIRED
```

- **DRAFT**: Created, documents uploaded, fields placed, not yet sent
- **SENT**: All recipients notified, awaiting first action
- **IN_PROGRESS**: At least one signer has viewed or signed
- **COMPLETED**: All signers signed; certificates generated; signed PDFs stored
- **DECLINED**: A signer declined (stops the entire envelope)
- **VOIDED**: Sender cancelled the envelope
- **EXPIRED**: Past expiration date with incomplete signatures

### 1.7 Certificate ID Format

```
OAK-ES-20260310-8F3A2B4D-C7E1
```

- `OAK-ES` — prefix (ES = e-signing)
- `YYYYMMDD` — date created
- `8-char hex` — random (~4.3 billion combinations per day)
- `4-char hex` — check segment

---

## 2. Preparation UX (Field Placement)

### 2.1 Envelope Creation Wizard

Three-step flow:

**Step 1 — Upload & Recipients**

- Drag-and-drop zone + file picker for PDF uploads
- Document list with reorder (drag handles), thumbnail preview, remove button
- Supported formats: PDF only (Phase 1)
- Max file size: 25 MB per file, no envelope size limit
- Recipient form: name, email, type (Signer / CC)
- Signing order toggle: Parallel (default) / Sequential / Mixed
- For sequential/mixed: drag-to-reorder or number assignment; same number = parallel group
- Each signer auto-assigned a distinct color (used in field placement UI)
- Access mode selector: Email Link / Email + Access Code / Manual Link
- Subject line + message body fields

**Step 2 — Place Fields**

Full-width layout with three zones:

```
┌─────────────┬──────────────────────────────┬──────────────┐
│  Field       │                              │  Page        │
│  Palette     │    PDF Document View         │  Thumbnails  │
│             │    (pdf.js canvas +           │  & Field     │
│  ─────────  │     field overlay layer)      │  Properties  │
│  [Signer ▼] │                              │              │
│  color dot  │                              │  Thumbnails  │
│             │                              │  (click to   │
│  Signature  │                              │   jump,      │
│  Initials   │                              │   icons show │
│  Date       │                              │   pages with │
│  Name       │                              │   fields)    │
│  Text       │                              │              │
│  Checkbox   │                              │  ── or ──    │
│  Company    │                              │              │
│  Title      │                              │  Field Props │
│             │                              │  when field  │
│             │                              │  selected    │
└─────────────┴──────────────────────────────┴──────────────┘
│  Toolbar: Zoom | Undo/Redo | Document tabs (multi-doc)     │
└────────────────────────────────────────────────────────────┘
```

**Left panel — Field Palette:**
- Recipient selector dropdown with color indicator
- Switching recipient changes field color for subsequent placements
- Field type buttons: click a type to enter placement mode

**Center — Document View:**
- pdf.js renders each page to canvas
- Overlay div layer holds placed fields as absolutely-positioned React components
- Fields show recipient color, type icon, and label
- Click field to select (shows resize handles for resizable types)
- Drag to reposition
- Multi-document: tab bar to switch between documents
- Zoom: 50%, 75%, 100% (default), 125%, 150%, Fit Width
- Lazy page rendering: only visible pages + 1 buffer page

**Right panel — Context-Sensitive:**
- Default: page thumbnails with field indicator icons
- When field selected: property panel (recipient, required toggle, label, placeholder, font size)

**Toolbar:**
- Undo/Redo stack (field add, move, resize, delete, property changes)
- Document tabs for multi-document envelopes
- Zoom level selector

### 2.2 Click-to-Place Interaction Model

Following DocuSign's pattern:

1. Sender clicks a field type in palette → enters placement mode
2. Cursor changes (crosshair + field type icon)
3. Field "ghost" follows cursor over the document
4. Click on document → field placed at default size
5. Stays in placement mode (place multiple of same type)
6. `Escape` or re-click palette → exits placement mode
7. Click existing field → select (resize handles + properties panel)
8. Drag selected field → reposition
9. `Delete` key or trash icon → remove selected field

### 2.3 Coordinate System

All field positions stored as percentages relative to page dimensions:

- `xPercent`, `yPercent` = top-left corner of the field
- `widthPercent`, `heightPercent` = field dimensions
- Conversion to screen: `xPercent / 100 * renderedPageWidth = pixelX`
- Conversion to PDF points: `xPercent / 100 * pdfPageWidthInPoints = absoluteX`
- Ensures fields render correctly at any zoom level, screen size, or DPI

**Step 3 — Review & Send**

- Summary: document list, recipient list with field count per signer
- Preview button: renders document as signer would see it (per-recipient preview)
- Envelope settings: expiration days, reminder frequency, reminder start delay, expiry warning days
- Auto-file toggle with company selector (optional)
- **Send** button (or **Get Link** for manual link mode)

---

## 3. Signing Experience (Public Signer View)

### 3.1 Entry Flow

```
Email link / manual link clicked
  → Access gate (if applicable)
      → EMAIL_LINK: no gate, direct access
      → EMAIL_WITH_CODE: "Enter your access code" input screen
      → MANUAL_LINK: no gate (code optional per recipient)
  → Consent screen
      → "I agree to use electronic records and signatures"
      → Shows: sender name, tenant name, envelope title, document list
      → [Continue] button
  → Signing view
```

### 3.2 Signing View Layout

**Desktop:**

```
┌────────────────────────────────────────────────────────┐
│  Header: Envelope title | Sender info | Other Options ▼│
├──────┬─────────────────────────────────────────────────┤
│      │                                                 │
│ POST │   PDF Document View                             │
│  IT  │   (pdf.js canvas, fields as interactive inputs) │
│ TAB  │                                                 │
│      │   ┌──────────────────┐                         │
│ Sign │──►│ [Signature field] │  ← pulsing border       │
│      │   └──────────────────┘                         │
│      │                                                 │
├──────┴─────────────────────────────────────────────────┤
│  Footer: [Finish]  |  Page X of Y  |  Zoom controls   │
└────────────────────────────────────────────────────────┘
```

### 3.3 "Post-It" Bookmark Navigation

Inspired by DocuSign's "Sign Here" tab — a physical post-it metaphor:

- **Shaped like a folded tab** sticking out from the left edge of the active field (slight shadow for depth)
- **Oakcloud teal** (`#294d44`) background with white text
- **Label changes by field type**: "Sign", "Initial", "Fill", "Check", "Date"
- Small icon matching the action (pen for signature, text cursor for fill, etc.)
- Subtle tooltip on hover: "Required - Sign Here"
- **On click**: performs the field action (opens signature pad, focuses input, toggles checkbox) then animates to the next unfilled required field
- Auto-scrolls across pages if needed
- Field completion order follows `sortOrder` set by sender during preparation
- When all required fields completed: post-it transforms into a **"Finish"** tab

**Mobile**: same post-it concept, slightly smaller; tapping scrolls + zooms to center the target field on screen.

### 3.4 Field States During Signing

| State | Visual |
|-------|--------|
| Unfilled required | Pulsing border in signer color, type icon + action label |
| Unfilled optional | Subtle dashed border, "optional" label |
| Active / focused | Solid border, elevated shadow |
| Filled | Content shown, subtle checkmark badge, border fades to muted |

### 3.5 Signature Capture Modal

Opens when signer clicks a Signature or Initials field:

```
┌───────────────────────────────────────┐
│  Adopt Your Signature                 │
│                                       │
│  Full Name: [___________________]     │
│  Initials:  [____]                    │
│                                       │
│  ┌── Draw ──┬── Type ──┬── Upload ──┐ │
│  │  Canvas   │ Preview  │  Drop zone │ │
│  │  area     │ in font  │  for image │ │
│  └───────────┴──────────┴───────────┘ │
│                                       │
│  Style: ○ Script  ○ Formal  ○ Clean   │
│  (for Type mode — 3-4 font choices)   │
│                                       │
│  □ Apply to all Signature fields      │
│  □ Apply to all Initials fields       │
│                                       │
│         [Cancel]    [Adopt and Sign]   │
└───────────────────────────────────────┘
```

Three input methods:
- **Draw**: Canvas with smooth bezier interpolation, touch support, undo last stroke
- **Type**: Name rendered in handwriting font (Dancing Script, Pinyon Script, Caveat)
- **Upload**: Image upload with crop/resize

After first adoption, signature is cached for the session — subsequent Signature fields auto-fill with one click.

### 3.6 Completion Flow

```
All required fields filled
  → "Post-it" bookmark transforms to "Finish" tab
  → Signer clicks Finish
  → Confirmation: "You've signed [document names]. A copy will be sent to your email."
  → Options: [Download] [Close]
  → If sequential: next signer notified
  → If all signers done: envelope → COMPLETED
```

### 3.7 "Other Options" Menu

| Option | Action |
|--------|--------|
| Finish Later | Saves progress; signer returns via same link |
| Decline to Sign | Reason modal → envelope status → DECLINED; sender notified |
| Download Original | Download unsigned PDFs for review |
| Session Information | Signer name, email, envelope ID |

### 3.8 Mobile Signing

- Full-width document view, no side panels
- Post-it bookmark as floating action button (bottom-right) with arrow icon
- Pinch-to-zoom on document
- Signature modal goes full-screen
- Native mobile keyboards for text inputs
- Landscape orientation prompt for signature drawing

---

## 4. Completion, Certificate & Post-Signing

### 4.1 Completion Trigger

When the last signer clicks Finish:

1. Envelope status → `COMPLETED`, `completedAt` set
2. **Signed PDF generation** per document:
   - Load original PDF via pdf-lib
   - Embed all field values (signatures as images, text as overlays, checkboxes as check marks, dates as text)
   - Stamp certificate ID on bottom-right of every page
   - Append completion certificate as final page(s)
   - Save to `{tenantId}/esigning/{envelopeId}/signed/{documentId}.pdf`
3. Email signed PDFs to all parties (signers + CC + sender)
4. Auto-file to company folder if enabled

### 4.2 Certificate Page Design (Dropbox Sign-Inspired)

Each document gets its own certificate appended. Visual, clean, timeline-based:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌─── Oakcloud ───────────────────────────────────┐ │
│  │  Certificate of Completion                     │ │
│  │  Certificate ID: OAK-ES-20260310-8F3A2B4D-C7E1│ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Envelope Title:    Q1 Tax Declaration Package      │
│  Document:          Individual Declaration Form.pdf │
│  Envelope ID:       env_8f3a2b...                   │
│  Status:            ● Completed                     │
│                                                     │
│  ─── Timeline ───────────────────────────────────── │
│                                                     │
│   ● Created                                         │
│   │  Mar 10, 2026  2:30 PM SGT                     │
│   │  By: Jane Accountant (jane@firm.com)           │
│   │                                                 │
│   ● Sent for Signing                                │
│   │  Mar 10, 2026  2:31 PM SGT                     │
│   │                                                 │
│   ● Viewed by Ray Client                            │
│   │  Mar 10, 2026  3:15 PM SGT                     │
│   │  IP: 203.0.113.42                              │
│   │                                                 │
│   ● Signed by Ray Client (ray@client.com)          │
│   │  Mar 10, 2026  3:18 PM SGT                     │
│   │  IP: 203.0.113.42                              │
│   │                                                 │
│   ● Completed                                       │
│     Mar 10, 2026  3:18 PM SGT                      │
│                                                     │
│  ─── Signers ────────────────────────────────────── │
│                                                     │
│   ┌────────────────────────────────────────┐       │
│   │  Ray Client                            │       │
│   │  ray@client.com                        │       │
│   │  Status: Signed                        │       │
│   │  Signed: Mar 10, 2026  3:18 PM SGT    │       │
│   │  IP: 203.0.113.42                      │       │
│   │  Signature:  [signature image]         │       │
│   └────────────────────────────────────────┘       │
│                                                     │
│  ───────────────────────────────────────────────── │
│  This document was signed electronically via       │
│  Oakcloud E-Signing.                               │
│  Certificate ID: OAK-ES-20260310-8F3A2B4D-C7E1    │
│  Powered by Oakcloud.                              │
└─────────────────────────────────────────────────────┘
```

### 4.3 Per-Page Certificate ID Watermark

Every page of every document:

```
                          OAK-ES-20260310-8F3A2B4D-C7E1 │ Page 1 of 3
```

- Position: bottom-right corner, 8px from edges
- Style: light gray (#a0a5b0), ~8pt font, semi-transparent
- Does not overlap existing content (positioned in margin area)

### 4.4 Download Options

| Option | Description |
|--------|-------------|
| Download All (Combined) | Single PDF: all documents + certificates concatenated |
| Download Individual | Per-document signed PDF with its certificate appended |
| Download Certificates Only | Just the certificate pages |

---

## 5. Envelope Management Dashboard

### 5.1 Navigation

New sidebar item: **E-Signing** → `/esigning`

### 5.2 List View

**Filter tabs:**

| Tab | Shows |
|-----|-------|
| All | Everything |
| Action Required | Drafts, declined envelopes needing attention |
| Waiting for Others | Sent / In Progress |
| Completed | All completed |
| Voided / Expired | Cancelled or timed-out |

**Table columns:**

| Column | Content |
|--------|---------|
| Title | Envelope title (click → detail) |
| Status | Badge with semantic colors |
| Recipients | Signer names with status icons |
| Documents | Count + first document name |
| Created | Relative timestamp |
| Last Activity | Most recent event |

**Row actions:** View, Resend, Void, Duplicate, Delete (drafts only)

### 5.3 Envelope Detail View

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to E-Signing                                    │
│                                                         │
│  Q1 Tax Declaration Package          [Resend] [Void]    │
│  Status: ● In Progress                                  │
│  Sent: Mar 10, 2026 · Expires: Apr 9, 2026             │
├──────────┬──────────────────────────────────────────────┤
│Recipients│  Documents                                   │
│          │  Document cards with page count, field count, │
│ Per-     │  [Preview] and [Download] buttons            │
│ signer   │                                              │
│ status   │  Activity Timeline                           │
│ with     │  Chronological event list                    │
│ actions  │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Correct action** (per recipient): modal to edit name/email on in-progress envelopes. Invalidates old access token, generates new one, resends.

**Completed detail** additionally shows: download options, auto-filed location link, certificate ID.

---

## 6. Permissions (RBAC)

New permission surface `esigning:*`:

| Permission | Description |
|------------|-------------|
| `esigning:create` | Create envelopes, upload documents, place fields |
| `esigning:send` | Send envelopes to recipients |
| `esigning:view` | View all envelopes in tenant (not just own) |
| `esigning:void` | Void any in-progress envelope in tenant |
| `esigning:delete` | Delete draft envelopes |

**Scoping:**
- Users with `esigning:create` + `esigning:send` always see/manage their own envelopes
- `esigning:view` and `esigning:void` extend to all tenant envelopes
- `SUPER_ADMIN` has full access across tenants

---

## 7. Storage Layout

```
{tenantId}/esigning/
├── {envelopeId}/
│   ├── original/
│   │   ├── {documentId}_filename.pdf
│   │   └── {documentId}_filename.pdf
│   ├── signed/
│   │   ├── {documentId}_filename_signed.pdf
│   │   └── {documentId}_filename_signed.pdf
│   └── signatures/
│       ├── {recipientId}_signature.png
│       └── {recipientId}_initials.png
```

- Original PDFs preserved immutably
- Signed PDFs generated at completion
- Signature images stored per recipient per envelope (not reused across envelopes)
- Auto-filed copies are actual copies to `{tenantId}/companies/{companyId}/documents/...`

---

## 8. Email Templates

### 8.1 Signing Request

**To:** Each signer (on send or resend)

```
Subject: [Sender Name] has sent you "[Envelope Title]" for signing

[Sender Name] from [Tenant Name] has sent you documents to sign.

[Envelope message if provided]

Documents:
• Document 1.pdf
• Document 2.pdf

[Review and Sign]

This request expires on [expiry date].
```

### 8.2 CC Notification

**To:** CC recipients (on send)

```
Subject: [Sender Name] sent "[Envelope Title]" — you're copied

[Sender Name] has sent documents for signing. You've been
included as a copy recipient.

You'll receive the signed documents once all parties have signed.
```

### 8.3 Completion

**To:** All parties (sender, signers, CC)

```
Subject: Completed: "[Envelope Title]"

All parties have signed. Signed documents are attached.

Certificate ID: OAK-ES-20260310-8F3A2B4D-C7E1

[View in Oakcloud]  — for sender
[Download Documents] — for external parties (token-guarded)

Attachments: signed PDFs with certificates
```

### 8.4 Declined

**To:** Sender

```
Subject: Declined: "[Envelope Title]"

[Signer Name] has declined to sign.

Reason: "[decline reason]"

[View Envelope]
```

### 8.5 Expiry Warning

**To:** Sender

```
Subject: Expiring soon: "[Envelope Title]" — [X] days remaining

The following signers have not yet signed:
• [Signer Name] — [status]

Expires: [expiry date]

[View Envelope]
```

---

## 9. Signature Pad Component Upgrades

The existing `signature-pad.tsx` needs enhancement:

| Current | Upgrade |
|---------|---------|
| Basic pointer events | Smooth stroke interpolation (quadratic bezier curves) |
| Fixed canvas size | Responsive canvas with aspect ratio preservation |
| PNG export only | PNG + SVG export (SVG scales better in PDFs) |
| No touch optimization | Touch handling with palm rejection, pressure sensitivity |
| Simple clear/reset | Undo last stroke |
| No typed signatures | Typed mode: text → rendered in handwriting fonts (Dancing Script, Pinyon Script, Caveat) |
| No upload option | Image upload with crop/resize |
| No session caching | Cache adopted signature for signing session |

---

## 10. API Routes

### 10.1 Authenticated (Sender / Dashboard)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/esigning/envelopes` | Create draft envelope |
| GET | `/api/esigning/envelopes` | List envelopes (with filters) |
| GET | `/api/esigning/envelopes/[id]` | Get envelope detail |
| PATCH | `/api/esigning/envelopes/[id]` | Update draft |
| DELETE | `/api/esigning/envelopes/[id]` | Delete draft |
| POST | `/api/esigning/envelopes/[id]/documents` | Upload document |
| DELETE | `/api/esigning/envelopes/[id]/documents/[docId]` | Remove document |
| PATCH | `/api/esigning/envelopes/[id]/documents/[docId]` | Reorder document |
| PUT | `/api/esigning/envelopes/[id]/fields` | Save all fields (bulk upsert) |
| POST | `/api/esigning/envelopes/[id]/recipients` | Add recipient |
| PATCH | `/api/esigning/envelopes/[id]/recipients/[recipientId]` | Update / correct recipient |
| DELETE | `/api/esigning/envelopes/[id]/recipients/[recipientId]` | Remove recipient |
| POST | `/api/esigning/envelopes/[id]/send` | Send envelope |
| POST | `/api/esigning/envelopes/[id]/void` | Void envelope |
| POST | `/api/esigning/envelopes/[id]/resend/[recipientId]` | Resend to recipient |
| GET | `/api/esigning/envelopes/[id]/download` | Download signed PDFs |
| GET | `/api/esigning/envelopes/[id]/events` | Get audit trail |

### 10.2 Public (Signer-Facing)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/esigning/sign/[token]` | Load signing session |
| POST | `/api/esigning/sign/[token]/verify` | Verify access code |
| POST | `/api/esigning/sign/[token]/view` | Record "viewed" event |
| PUT | `/api/esigning/sign/[token]/fields` | Save field values (auto-save) |
| POST | `/api/esigning/sign/[token]/complete` | Signer clicks Finish |
| POST | `/api/esigning/sign/[token]/decline` | Signer declines |
| GET | `/api/esigning/sign/[token]/download` | Download original PDFs |

### 10.3 Public Route Security

- Token: `accessToken` from EnvelopeRecipient (crypto random, 64 chars, unguessable)
- Rate limited per IP (same pattern as existing form public endpoints)
- Token validated against envelope status (can't sign voided/expired/completed envelopes)
- Access code verification required before other actions for EMAIL_WITH_CODE mode
- Field saves are idempotent

---

## 11. Service Layer

| Service | Responsibility |
|---------|---------------|
| `esigning-envelope.service.ts` | CRUD, status transitions, validation, sending, voiding, correction |
| `esigning-field.service.ts` | Field placement CRUD, coordinate validation, bulk upsert |
| `esigning-signing.service.ts` | Public signing: load session, verify access, save fields, complete, decline |
| `esigning-pdf.service.ts` | Signed PDF assembly: embed signatures/fields, stamp certificate IDs, generate certificate pages |
| `esigning-notification.service.ts` | All email dispatch: signing requests, completions, declines, reminders, expiry warnings |
| `esigning-certificate.service.ts` | Certificate ID generation, certificate page HTML/PDF rendering |

### Background Tasks (Scheduler)

| Task | Schedule | Purpose |
|------|----------|---------|
| `esigning-expiry-check` | Hourly | Transition expired envelopes, notify sender |
| `esigning-reminders` | Daily | Send auto-reminders to pending signers per envelope settings |
| `esigning-cleanup` | Daily | Remove orphaned uploads from deleted draft envelopes |

---

## 12. Technical Stack Additions

| Library | Purpose |
|---------|---------|
| `react-pdf` (wraps pdf.js) | Client-side PDF rendering for preparation and signing views |
| `pdf-lib` (existing) | Server-side signed PDF assembly, signature embedding, certificate ID stamping |
| Signature pad upgrades | Draw/type/upload signature capture |
| Google Fonts (Dancing Script, Pinyon Script, Caveat) | Typed signature rendering |

---

## 13. Future Phases (Out of Scope)

Designed for but not implemented in Phase 1:

- **Templates**: Save envelope configurations (recipients, field placements) for reuse
- **Agreement management**: Track signed agreements, renewal dates, compliance status
- **Bulk/batch sending**: Send same document to many recipients
- **Additional field types**: Dropdowns, radio buttons, attachments, formulae
- **Digital certificates**: P12/PFX-based tamper-evident PDF signing via @signpdf/signpdf
- **Anchor text placement**: Auto-detect "Sign Here" text and suggest field positions
- **Reassign**: Signer forwards signing responsibility to someone else
