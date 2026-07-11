# BizFile New-Company Review Redesign

## Goal

Redesign the new-company BizFile preview so a user can efficiently compare the extracted data with the source document, correct every extracted value, add missing records, remove incorrect records, and save the corrected dataset.

This design applies only to the new-company preview. The existing-company update and diff flow remains unchanged.

## Success Criteria

- Every field represented by `ExtractedBizFileData` is visible and editable.
- Users can add, duplicate, edit, and remove repeating records where applicable.
- The BizFile remains visible beside the review interface on desktop.
- Missing required values and invalid values are easy to locate before saving.
- The server saves the corrected client-submitted dataset rather than the original extraction snapshot.
- Existing upload, cancel, reset, keyboard shortcut, conflict handling, dark-mode, and responsive behavior continues to work.

## Information Architecture

The preview remains a resizable two-panel workspace:

- Left: existing BizFile document viewer.
- Right: editable review workspace.

The review workspace has three persistent layers:

1. A compact summary header describing the extraction result and review state.
2. Section navigation showing completeness and validation state.
3. A sticky action footer containing upload-again, cancel, and confirm-and-save actions.

The editable content is divided into these sections:

1. Entity
2. Addresses
3. Business activities
4. Capital
5. Officers
6. Shareholders
7. Auditor
8. Compliance and financial year
9. Charges
10. Document details

## Field Coverage

### Entity

- UEN
- Name
- Former name
- Date of name change
- Former names history: name, effective from, effective to
- Entity type
- Status
- Status date
- Incorporation date
- Registration date

### Addresses

- Registered address: block, street, level, unit, building, postal code, country, effective from
- Mailing address: block, street, level, unit, building, postal code, country

### Business Activities

- Primary SSIC code and description
- Secondary SSIC code and description

### Capital

- Home currency
- Paid-up capital amount and currency
- Issued capital amount and currency
- Share capital rows: class, currency, number of shares, par value, total value, paid-up flag, treasury flag
- Treasury shares: number of shares and currency

### Officers

- Name
- Role
- Identification type and number
- Nationality
- Address
- Appointment date
- Cessation date

### Shareholders

- Name
- Type
- Identification type and number
- Nationality
- Place of origin
- Address
- Share class
- Number of shares
- Percentage held
- Currency

### Auditor

- Name
- Address
- Appointment date

### Compliance and Financial Year

- Financial year-end day and month
- FYE as at last annual return
- Last AGM date
- Last annual return filing date
- Accounts due date
- Compliance FYE as at last annual return

### Charges

- Charge number
- Charge type
- Description
- Charge holder name
- Amount secured
- Amount secured text
- Currency
- Registration date
- Discharge date

### Document Details

- Receipt number
- Receipt date

Optional fields remain visible even when extraction returns no value, allowing the user to fill data the AI missed.

## Interaction Design

The section navigator uses compact rows with section names, record counts where relevant, and one of three states: complete, needs attention, or contains errors. Selecting a section scrolls or switches the editor to that section without affecting the document viewer.

Scalar fields use the application's standard inputs, selects, date controls, number controls, and checkboxes. Enumerated fields use constrained selects when the accepted values are known. Codes and identifiers use a monospace value style while retaining the standard input appearance.

Former names, share-capital classes, officers, shareholders, and charges are repeating row editors. Each supports add, duplicate, and remove. Destructive removal is reversible during the unsaved editing session through an inline undo affordance. Empty optional singleton groups such as auditor or mailing address remain available as editable groups rather than disappearing.

The header reports the number of reviewed sections, validation issues, and repeating records. It includes a neutral warning that AI-extracted information must be verified. AI provider, model, usage, and cost metadata remains available as secondary metadata without competing with the review task.

The sticky footer keeps these actions visible:

- Upload Different File
- Cancel
- Confirm & Save

The existing keyboard shortcuts remain: `Ctrl+Backspace` cancels and `Ctrl+S` attempts save. If validation fails, save is prevented and focus moves to the first invalid field. Navigating away after any edit prompts for confirmation.

## Responsive Behavior

At desktop widths, the document and form stay side by side with the existing resizable divider. The right panel owns its internal scrolling so the summary, navigation, and action footer can remain accessible.

At narrower widths, the interface uses document and review tabs rather than compressing both panels. The review section navigation becomes a compact horizontal or select-based control. Editable row layouts stack into labeled field groups while keeping row actions accessible.

## Component Boundaries

The large upload page should delegate the new-company review UI to focused components:

- Review workspace: owns section selection, summary, and footer composition.
- Section navigation: derives completeness and error states.
- Field sections: render and update their corresponding schema slice.
- Repeating record editor: provides consistent add, duplicate, remove, and undo behavior.
- Validation summary: maps issues to sections and fields.

Form state and mutations remain controlled by the review workspace or a dedicated hook. Static field definitions and validation rules live outside React render functions. The update/diff preview retains its current implementation and is not migrated as part of this work.

## Data Flow

1. Upload and extraction continue to populate `extractedData`.
2. The preview initializes an editable draft from that extraction result.
3. User edits update the draft immutably, including nested and repeating values.
4. Client validation runs while editing and before submission.
5. Confirm sends the complete corrected draft in the request body.
6. The confirm route validates and normalizes the submitted draft, persists that exact corrected version to the pending document, and passes it to `processBizFileExtraction`.
7. On success, the existing navigation to the created company continues.

The server must not trust arbitrary client data. Request validation must reject malformed structures, invalid enumerations, non-finite or negative values where disallowed, and missing required company identifiers. Server normalization remains authoritative for formatting.

## Validation

Required fields for save are:

- Entity UEN
- Entity name
- Entity type
- Entity status
- Registered-address street name and postal code when a registered-address group exists
- SSIC code and description for each present activity
- Name and role for each officer
- Name, type, share class, and non-negative share count for each shareholder
- Share class, currency, non-negative share count, and non-negative total value for each share-capital row
- Charge holder name for each charge

Dates must use valid ISO date values. Financial year day and month must form a valid calendar date. Amounts, share counts, and percentages must be finite; share counts and monetary values cannot be negative, and percentages must be between 0 and 100. Blank optional groups are omitted from the submitted normalized structure instead of being saved as meaningless empty objects.

Validation messages appear next to the affected input, at section level in navigation, and in a concise save-attempt summary. Validation does not require users to manually mark each field as reviewed.

## Error Handling

- Extraction errors retain the existing upload-page behavior.
- Client validation prevents submission and directs the user to the first error.
- Server validation returns field-addressable issues when possible; the review workspace maps them back to inputs without losing the draft.
- Network or persistence failures show the existing error alert pattern and leave all edits intact for retry.
- Confirm is disabled while saving to prevent duplicate submissions.
- Removing a repeating row is locally undoable until the draft is saved or reset.

## Accessibility

- Each input has a programmatic label and associated error description.
- Section navigation is keyboard reachable and exposes its selected and error states.
- Row actions have descriptive accessible names including the record name or row number.
- Focus moves predictably after adding, removing, undoing, and attempting an invalid save.
- Status is communicated with text and icons, not color alone.
- Sticky regions do not hide focused fields or validation messages.

## Visual Direction

Follow the Oakcloud design guideline: compact Linear-inspired density, 4px layout rhythm, subtle borders, standard semantic colors, and full light/dark support. The redesign should reduce card nesting and use section dividers, labels, and restrained status indicators to establish hierarchy. The source viewer remains visually dominant enough for comparison, while editable controls make it unambiguous that values can be changed.

No generated imagery is needed because this is an existing product surface using the established design system.

## Testing Strategy

### Unit and Component Tests

- Every `ExtractedBizFileData` field is represented in the review interface.
- Empty optional fields and groups can be populated.
- Scalar and nested field edits update the draft without mutating the extraction snapshot.
- Repeating rows can be added, duplicated, removed, and restored.
- Validation derives correct section states and focuses the first error.
- Confirm submits the edited draft rather than the original extraction.
- Unsaved-change protection activates only after the draft changes.
- The existing update/diff flow continues to render unchanged.

### API Tests

- Confirm accepts a valid corrected dataset and persists/processes it.
- Confirm rejects malformed or incomplete datasets with useful validation errors.
- Confirm ignores neither valid edits nor newly added nested records.
- Failed processing does not silently replace the corrected pending extraction with stale data.

### Browser Verification

- Desktop: upload result to editable preview, edit fields, add and remove people, trigger and resolve validation, then save.
- Narrow viewport: switch between document and review, edit a repeating row, and access sticky actions without overflow.
- Verify page identity, meaningful content, absence of framework overlays, console health, dark mode, keyboard shortcuts, and visible focus states.

## Out of Scope

- Redesigning the existing-company update/diff preview.
- Adding field-level document coordinates or click-to-highlight source citations, because the current extraction schema does not provide page/box provenance.
- Changing extraction models or prompts.
- Altering company-domain fields that are not represented by the BizFile extraction schema.
