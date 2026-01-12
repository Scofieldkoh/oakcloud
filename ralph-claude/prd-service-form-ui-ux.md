# PRD: Service Form UI/UX Improvement

> **Status**: Draft
> **Created**: 2026-01-12
> **Author**: Claude (AI Assistant)

## Overview

The current "Add Service" and "Edit Service" pages under Company > Contracts have UI inconsistencies compared to other form pages in the application (Companies, Contacts). Additionally, the Rich Text Editor used for the "Scope of Work" field is different from the A4PageEditor used in the Template Editor, creating an inconsistent editing experience. This PRD outlines improvements to align the service form with established design patterns and standardize the rich text editing experience.

## Goals

- **Consistent Page Layout**: Align the service form page layout with the established pattern used in Company and Contact creation pages
- **Better Form Organization**: Reorganize form fields in a logical, scannable structure using section cards with proper headers
- **Improved Form State Management**: Use `react-hook-form` with Zod validation for better form handling and validation feedback
- **Consistent Rich Text Editing**: Standardize the rich text editor toolbar and capabilities across the application
- **Full Page Utilization**: Restructure the layout to make better use of available space while maintaining readability
- **Design System Compliance**: Apply all UI consistency standards from `DESIGN_GUIDELINE.md`

## User Stories

### Story 1: Consistent Page Header Layout

**As a** user navigating to the Add/Edit Service page,
**I want** the page header to match other form pages in the application,
**So that** I have a consistent navigation experience.

**Acceptance Criteria:**
- [ ] Page uses `p-4 sm:p-6 max-w-4xl` container (not `max-w-7xl`)
- [ ] Back link uses pattern: `inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors`
- [ ] Back link text reads "Back to Contracts" with ArrowLeft icon
- [ ] Page title uses `text-xl sm:text-2xl font-semibold text-text-primary`
- [ ] Subtitle shows company name and contract title
- [ ] No full-screen background color override (`min-h-screen bg-background-secondary` removed)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Header matches Company/Contact new pages

### Story 2: Reorganized Form Sections

**As a** user filling out the service form,
**I want** the form fields organized in logical sections,
**So that** I can quickly understand and complete the form.

**Acceptance Criteria:**
- [ ] Form uses card sections with proper headers (`p-4 border-b border-border-primary` + section title)
- [ ] Section 1: "Service Information" - Name, Type, Status
- [ ] Section 2: "Billing Details" - Rate, Currency, Frequency (conditional)
- [ ] Section 3: "Schedule" - Start Date, End Date, Auto-renewal (conditional)
- [ ] Section 4: "Scope of Work" - Rich text editor (optional section, at bottom)
- [ ] Each section header uses `font-medium text-text-primary` (no icons in section headers)
- [ ] Grid layout: `grid grid-cols-1 md:grid-cols-2 gap-4` for field rows
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Sections display correctly and fields are aligned

### Story 3: Form State Management with react-hook-form

**As a** developer maintaining the codebase,
**I want** the service form to use `react-hook-form` with Zod validation,
**So that** form handling is consistent with other forms in the application.

**Acceptance Criteria:**
- [ ] Create Zod schema in `src/lib/validations/service.ts` for service form validation
- [ ] Use `useForm` with `zodResolver` for form state
- [ ] Use `register` for input fields instead of manual `onChange` handlers
- [ ] Error messages use `text-xs text-status-error mt-1.5` pattern
- [ ] Add `useUnsavedChangesWarning` hook for navigation protection
- [ ] Form submission converts string values to numbers as needed (rate, renewalPeriodMonths)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Validation errors display correctly, form submission works

### Story 4: Consistent Form Input Styling

**As a** user interacting with form fields,
**I want** all inputs styled consistently with other forms,
**So that** the UI feels cohesive.

**Acceptance Criteria:**
- [ ] All labels use `.label` class (12px, medium weight)
- [ ] All inputs use `input input-sm` classes
- [ ] Select dropdowns use `input input-sm` (not custom wrapper with separate label)
- [ ] Date inputs use `SingleDateInput` component or native `type="date"` with consistent styling
- [ ] Checkbox for auto-renewal uses `Checkbox` component from `@/components/ui/checkbox`
- [ ] Error states use `input-error` class on inputs
- [ ] Remove inline label styles (e.g., `text-xs font-medium text-text-secondary`)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: All inputs match Company/Contact form styling

### Story 5: Action Buttons Placement

**As a** user completing the form,
**I want** the action buttons positioned consistently,
**So that** I know where to find them.

**Acceptance Criteria:**
- [ ] Buttons placed at bottom using `flex items-center justify-end gap-3 pt-2`
- [ ] Cancel button: `btn-secondary btn-sm` (Link to contracts tab)
- [ ] Submit button: `btn-primary btn-sm flex items-center gap-2` with Save icon
- [ ] Submit button shows "Creating..." or "Saving..." during submission
- [ ] Buttons are outside the last card (not inside a card)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Buttons match Company/Contact form placement

### Story 6: Conditional Field Display

**As a** user selecting service options,
**I want** conditional fields to appear/hide smoothly,
**So that** I only see relevant options.

**Acceptance Criteria:**
- [ ] "Frequency" field only visible when Service Type is "RECURRING"
- [ ] "Auto-renewal" checkbox only visible when Service Type is "RECURRING"
- [ ] "Renewal Period (months)" field only visible when Auto-renewal is checked
- [ ] End Date hint text changes based on Service Type
- [ ] Use `watch` from react-hook-form to observe field values
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Fields show/hide correctly when changing Service Type

### Story 7: Edit Service Page Consistency

**As a** user editing an existing service,
**I want** the edit page to match the new page layout,
**So that** I have a consistent editing experience.

**Acceptance Criteria:**
- [ ] Edit page (`services/[serviceId]/page.tsx`) uses identical layout to new page
- [ ] Form pre-populates with existing service data
- [ ] Page title shows "Edit Service" (not "Add Service")
- [ ] Submit button text: "Update Service" / "Updating..."
- [ ] Back link navigates to contracts tab
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Edit page matches new page layout

### Story 8: Standardized Rich Text Editor Toolbar

**As a** user editing rich text content,
**I want** the same editing capabilities across all rich text editors,
**So that** I have a consistent editing experience.

**Acceptance Criteria:**
- [ ] Create a unified toolbar configuration shared between `RichTextEditor` and `A4PageEditor`
- [ ] Standard toolbar includes: Font Family, Font Size, Bold, Italic, Underline, Strikethrough
- [ ] Standard toolbar includes: Bullet List, Numbered List, Text Alignment (Left, Center, Right)
- [ ] Standard toolbar includes: Indent/Outdent, Line Spacing, Text Color
- [ ] Standard toolbar includes: Undo/Redo, Clear Formatting, Insert Link
- [ ] Font family options: Arial, Times New Roman, Courier New, Georgia, Verdana (consistent across editors)
- [ ] Font size options: 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36 (use pt for print/PDF, px for web display)
- [ ] Text color options: Default, Gray, Red, Orange, Green, Blue, Purple
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Both editors have identical toolbar options

### Story 9: Scope of Work Editor Enhancements

**As a** user entering service scope details,
**I want** rich text editing capabilities matching the template editor,
**So that** I can format content professionally.

**Acceptance Criteria:**
- [ ] Scope of Work section uses enhanced rich text editor with full toolbar
- [ ] Font family dropdown available (default: Arial)
- [ ] Font size dropdown available (default: 11pt equivalent)
- [ ] Text alignment buttons available (Left, Center, Right)
- [ ] Line spacing dropdown available (Single, 1.15, 1.5, Double)
- [ ] Indent/Outdent buttons available
- [ ] Undo/Redo buttons available
- [ ] Editor min-height: 200px (not 400px - more appropriate for service scope)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Scope editor has all formatting options

### Story 10: Service Modal Consistency (Legacy Component)

**As a** developer maintaining the codebase,
**I want** the service-modal.tsx to use consistent styling patterns,
**So that** if it's ever used, it matches the rest of the app.

**Acceptance Criteria:**
- [ ] Replace label styling `block text-sm font-medium text-text-primary mb-1` with `.label` class
- [ ] Ensure RichTextEditor uses consistent minHeight (200px for modal context)
- [ ] Update select dropdowns to use `input input-sm` classes
- [ ] Ensure all form inputs use consistent styling
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Modal form fields match other forms

### Story 11: A4PageEditor Design Token Alignment

**As a** developer maintaining the codebase,
**I want** A4PageEditor to use design tokens instead of hardcoded colors,
**So that** the editor respects the design system and theme changes.

**Acceptance Criteria:**
- [ ] Replace `text-gray-700 dark:text-gray-300` with `text-text-secondary` or appropriate token
- [ ] Replace `bg-gray-200 dark:bg-gray-700` with `bg-background-tertiary` or appropriate token
- [ ] Replace `bg-gray-50 dark:bg-gray-900` with `bg-background-secondary`
- [ ] Replace `border-gray-200 dark:border-gray-700` with `border-border-primary`
- [ ] Replace `bg-gray-300 dark:bg-gray-600` (dividers) with `bg-border-primary`
- [ ] Replace `opacity-40` with `opacity-50` for disabled state (consistent)
- [ ] Add active state styling to toolbar buttons (currently missing)
- [ ] TypeScript typecheck passes
- [ ] Verify in browser: Editor looks correct in both light and dark modes

## Functional Requirements

1. **FR-1**: Page must follow the "Detail/Form Pages" layout pattern from Design Guidelines
2. **FR-2**: Form must validate required fields (name, startDate) before submission
3. **FR-3**: Form must handle numeric fields (rate, renewalPeriodMonths) as strings in state, converting on submit
4. **FR-4**: Rich text editor for Scope must be optional and work without content
5. **FR-5**: Navigation must warn users of unsaved changes before leaving
6. **FR-6**: Form must show loading state during submission
7. **FR-7**: Successful submission must redirect to `/companies/{id}?tab=contracts`
8. **FR-8**: Error messages from API must be displayed to users
9. **FR-9**: Rich text editor toolbar must be consistent with template editor

## Non-Goals

- **NG-1**: No changes to the service API endpoints or data model
- **NG-2**: No changes to the service list display in ContractsTab
- **NG-3**: No new functionality (bulk add, templates, etc.) - pure UI/UX alignment
- **NG-4**: No changes to permission checks or RBAC
- **NG-5**: No mobile-specific optimizations beyond existing responsive patterns
- **NG-6**: No changes to A4PageEditor's page break or A4-specific features (only toolbar standardization)

## Design Considerations

### Current Page Layout (To Be Changed)
```
┌─────────────────────────────────────────────────────────────┐
│ [←] Add Service                                              │
│     Company Name • Contract Title                            │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Scope of Work       │ │ Service Details                 │ │
│ │                     │ │   Name: [___________]           │ │
│ │ [Rich Text Editor]  │ │   Type: [Dropdown] Status: [v]  │ │
│ │ (Limited toolbar)   │ │   Rate: [__] Currency: [v]      │ │
│ │                     │ │   Frequency: [v]                │ │
│ │                     │ │   Start: [date] End: [date]     │ │
│ │                     │ │   [x] Auto-renews [12] months   │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
│                                    [Cancel] [Add Service]    │
└─────────────────────────────────────────────────────────────┘
```

### Target Page Layout (To Be Implemented)
```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Contracts                                          │
│ Add Service                                                  │
│ Company Name • Contract Title                                │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Service Information ──────────────────────────────────┐  │
│ │ Name *                     │ Service Type              │  │
│ │ [_____________________]    │ [Recurring        v]      │  │
│ │                            │                           │  │
│ │ Status                     │                           │  │
│ │ [Active              v]    │                           │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ Billing Details ──────────────────────────────────────┐  │
│ │ Rate                       │ Currency                  │  │
│ │ [0.00__________________]   │ [SGD              v]      │  │
│ │                            │                           │  │
│ │ Billing Frequency          │                           │  │
│ │ [Monthly             v]    │ (only for Recurring)      │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ Schedule ─────────────────────────────────────────────┐  │
│ │ Start Date *               │ End Date                  │  │
│ │ [2026-01-12__________]     │ [____________________]    │  │
│ │                            │ Leave empty for ongoing   │  │
│ │                            │                           │  │
│ │ [x] Auto-renewal           │ Renewal Period            │  │
│ │     (only for Recurring)   │ [12] months               │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ Scope of Work (Optional) ─────────────────────────────┐  │
│ │ [Font v][Size v][B][I][U][S] | [•][1.]| [≡][≡][≡]|...│  │
│ │ [Rich Text Editor with full toolbar                   ]│  │
│ │ [                                                     ]│  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│                                    [Cancel] [💾 Add Service] │
└─────────────────────────────────────────────────────────────┘
```

### Rich Text Editor Detailed Comparison

#### Feature Comparison

| Feature | Current RichTextEditor | Current A4PageEditor | Target (Unified) |
|---------|----------------------|---------------------|------------------|
| Font Family | ❌ | ✅ 7 options | ✅ 5 options |
| Font Size | ✅ 14 sizes (px) | ✅ 12 sizes (pt) | ✅ 12 sizes |
| Font Color | ✅ 7 colors | ❌ | ✅ 7 colors |
| Bold/Italic/Underline | ✅ | ✅ | ✅ |
| Strikethrough | ✅ | ❌ | ✅ |
| Text Alignment | ❌ | ✅ | ✅ |
| Line Spacing | ❌ | ✅ | ✅ |
| Indent/Outdent | ❌ | ✅ | ✅ |
| Bullet/Numbered List | ✅ | ✅ | ✅ |
| Undo/Redo | ❌ | ✅ | ✅ |
| Links | ✅ | ❌ | ✅ |
| Clear Formatting | ✅ | ❌ | ✅ |
| H1 Style (preset) | ✅ | ❌ | ❌ (removed) |
| Divider (HR) | ✅ | ❌ | ✅ |
| Page Break | ❌ | ✅ | Context-specific |

#### Font Family Options

| RichTextEditor | A4PageEditor | Target |
|----------------|--------------|--------|
| ❌ None | Arial | Arial |
| | Times New Roman | Times New Roman |
| | Courier New | Courier New |
| | Georgia | Georgia |
| | Verdana | Verdana |
| | Trebuchet MS | ❌ Remove |
| | Lucida Console | ❌ Remove |

#### Font Size Options

| RichTextEditor | A4PageEditor | Target |
|----------------|--------------|--------|
| 8px | 8pt | 8 |
| 9px | 9pt | 9 |
| 10px | 10pt | 10 |
| 11px | 11pt | 11 |
| 12px | 12pt | 12 |
| 14px | 14pt | 14 |
| 16px | 16pt | 16 |
| 18px | 18pt | 18 |
| 20px | 20pt | 20 |
| 22px | ❌ | ❌ Remove |
| 24px | 24pt | 24 |
| 26px | ❌ | ❌ Remove |
| 28px | 28pt | 28 |
| 36px | 36pt | 36 |

**Note:** Use `pt` units consistently for print/PDF compatibility.

#### Font Color Options

| RichTextEditor | A4PageEditor | Target |
|----------------|--------------|--------|
| Default (inherit) | ❌ | Default |
| Gray (#6b7280) | ❌ | Gray |
| Red (#dc2626) | ❌ | Red |
| Orange (#ea580c) | ❌ | Orange |
| Green (#16a34a) | ❌ | Green |
| Blue (#2563eb) | ❌ | Blue |
| Purple (#9333ea) | ❌ | Purple |

#### Line Spacing Options

| RichTextEditor | A4PageEditor | Target |
|----------------|--------------|--------|
| ❌ None | Single (1) | Single |
| | 1.15 | 1.15 |
| | 1.5 (default) | 1.5 (default) |
| | Double (2) | Double |
| | 2.5 | 2.5 |
| | Triple (3) | Triple |

#### Toolbar Button Styling

| Property | RichTextEditor | A4PageEditor | Target |
|----------|----------------|--------------|--------|
| **Button padding** | `p-1.5` | `p-1.5` | ✅ Consistent |
| **Icon size** | `w-4 h-4` | `w-4 h-4` | ✅ Consistent |
| **Button text color** | `text-text-muted` | `text-gray-700 dark:text-gray-300` | Use design tokens |
| **Active state bg** | `bg-background-tertiary` | ❌ No active state | Add active state |
| **Hover bg** | `bg-background-secondary` | `bg-gray-200 dark:bg-gray-700` | Use design tokens |
| **Disabled opacity** | `opacity-50` | `opacity-40` | Standardize to `opacity-50` |

#### Toolbar Container Styling

| Property | RichTextEditor | A4PageEditor | Target |
|----------|----------------|--------------|--------|
| **Padding** | `p-1` | `p-2` | Standardize to `p-2` |
| **Gap** | `gap-0.5` | `gap-1` | Standardize to `gap-1` |
| **Background** | `bg-background-secondary` | `bg-gray-50 dark:bg-gray-900` | Use design tokens |
| **Border** | `border-b border-border-primary` | `border-b border-gray-200 dark:border-gray-700` | Use design tokens |

#### Dropdown/Select Styling

| Property | RichTextEditor | A4PageEditor | Target |
|----------|----------------|--------------|--------|
| **Font size dropdown** | Custom dropdown with grid | Native `<select>` | Use consistent pattern |
| **Color dropdown** | Custom dropdown with swatches | ❌ None | Custom dropdown |
| **Select styling** | ❌ N/A | `px-2 py-1 text-xs border rounded` | Standardize |
| **Select bg** | ❌ N/A | `bg-white dark:bg-gray-800` | Use design tokens |

#### Divider Styling

| Property | RichTextEditor | A4PageEditor | Target |
|----------|----------------|--------------|--------|
| **Width** | `w-px` | `w-px` | ✅ Consistent |
| **Height** | `h-5` | `h-5` | ✅ Consistent |
| **Color** | `bg-border-primary` | `bg-gray-300 dark:bg-gray-600` | Use design tokens |
| **Margin** | `mx-1` | `mx-1` | ✅ Consistent |

#### Editor Content Area Styling

| Property | RichTextEditor | A4PageEditor | Target |
|----------|----------------|--------------|--------|
| **Font family** | System (Inter) | `Arial, Helvetica, sans-serif` | Arial (consistent) |
| **Font size** | `text-sm` (13px) | `11pt` | `11pt` for forms |
| **Line height** | Default | `1.5` | `1.5` |
| **Text color** | `text-text-primary` | `#000` | Use design tokens |
| **Padding** | `px-3 py-2` | Via absolute positioning | `px-3 py-2` |
| **Border** | `border border-border-primary rounded-md` | None (A4 page has own border) | Context-specific |
| **Focus ring** | `focus-within:border-accent-primary focus-within:ring-1` | None | Add focus ring |

### RichTextEditor Usages Across the App

The following locations use `RichTextEditor` and need consistent styling:

| Location | File | minHeight | Other Props | Notes |
|----------|------|-----------|-------------|-------|
| **Service Form (New)** | `services/new/page.tsx` | 400 | - | Full page form |
| **Service Form (Edit)** | `services/[serviceId]/page.tsx` | 400 | - | Full page form |
| **Service Modal** | `service-modal.tsx` | 150 | - | Modal dialog (legacy) |
| **Internal Notes** | `internal-notes.tsx` | 380 | `className="border-0 rounded-none"` | Tab-based notes editor |

### A4PageEditor Usages Across the App

The following locations use `A4PageEditor`:

| Location | File | Mode | Notes |
|----------|------|------|-------|
| **Template Editor** | `template-partials/editor/page.tsx` | Edit | Full page editor with sidebars |
| **Document Generation Wizard** | `document-generation-wizard.tsx` | Edit | Step in wizard |
| **Generated Document View** | `generated-documents/[id]/page.tsx` | Read-only | Document preview |
| **Generated Document Edit** | `generated-documents/[id]/edit/page.tsx` | Edit | Edit existing document |

### Full Page Layout Comparison (Add Service vs Company/Contact Pages)

#### Page Container

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Outer container** | `min-h-screen bg-background-secondary` | `p-4 sm:p-6 max-w-4xl` | `p-4 sm:p-6 max-w-4xl` |
| **Max width** | `max-w-7xl` | `max-w-4xl` | `max-w-4xl` |
| **Content padding** | `px-6 py-6` | Built into container | `p-4 sm:p-6` |
| **Background** | Full-page `bg-background-secondary` | None (inherits) | None |

#### Header Section

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Header wrapper** | Separate `div` with `bg-background-primary border-b` | Part of main content `mb-6` | `mb-6` only |
| **Back link style** | Icon-only button: `p-2 -ml-2 rounded-lg` | Text + icon: `inline-flex items-center gap-2 text-sm` | Text + icon link |
| **Back link text** | None (icon only) | "Back to Companies/Contacts" | "Back to Contracts" |
| **Title size** | `text-xl font-semibold` | `text-xl sm:text-2xl font-semibold` | `text-xl sm:text-2xl` |
| **Subtitle margin** | `mt-0.5` | `mt-1` | `mt-1` |

#### Form Structure

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Form layout** | `grid grid-cols-1 lg:grid-cols-2 gap-6` | `space-y-6` (single column) | `space-y-6` |
| **Form state** | `useState` with manual validation | `react-hook-form` + Zod | `react-hook-form` + Zod |
| **Unsaved changes warning** | ❌ Missing | ✅ `useUnsavedChangesWarning` | Add hook |
| **Permission check** | ❌ Missing | ✅ `usePermissions` | Add check |

#### Card Sections

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Card class** | `card p-6` | `card` (no padding) | `card` |
| **Card header** | `h2` inside padding | Separate `div` with `p-4 border-b border-border-primary` | With border |
| **Card header text** | `text-sm font-medium text-text-primary mb-4` | `font-medium text-text-primary` | `font-medium` |
| **Card content** | In same div as header | Separate `div` with `p-4 space-y-4` | Separate div |
| **Content spacing** | `space-y-4` | `space-y-4` | ✅ Consistent |

#### Form Labels

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Label class** | `text-xs font-medium text-text-secondary` (inline) | `.label` class | `.label` class |
| **Label wrapper** | `flex flex-col gap-1.5` | Direct sibling | Direct sibling |
| **Required indicator** | In FormInput prop or label text | In label text `*` | In label text |

#### Form Inputs

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Input class** | `input input-sm w-full` | `input input-sm` | ✅ Consistent |
| **Error class** | Not consistently applied | `input-error` | `input-error` |
| **Error message** | Via FormInput component | `text-xs text-status-error mt-1.5` | `mt-1.5` pattern |
| **Select styling** | `input input-sm w-full` | `input input-sm` | ✅ Consistent |

#### Form Grid Layout

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **2-column grid** | `grid grid-cols-2 gap-4` | `grid grid-cols-1 md:grid-cols-2 gap-4` | `md:` breakpoint |
| **3-column grid** | `grid grid-cols-3 gap-4` | `grid grid-cols-1 md:grid-cols-3 gap-4` | `md:` breakpoint |

#### Action Buttons

| Property | Add Service Page | Company/Contact Pages | Target |
|----------|-----------------|----------------------|--------|
| **Container** | `flex justify-end gap-3` | `flex items-center justify-end gap-3 pt-2` | Add `items-center pt-2` |
| **Cancel button** | `Button` component | Link with `btn-secondary btn-sm` | Link |
| **Submit button** | `Button` component | `button` with `btn-primary btn-sm flex items-center gap-2` | With Save icon |
| **Loading state** | `Loader2` inside button | Text change + disabled | Text change pattern |
| **Save icon** | ❌ Missing | ✅ `Save` icon | Add icon |

#### Missing Features in Add Service Page

| Feature | Company/Contact Pages | Add Service Page |
|---------|----------------------|------------------|
| **Permission check** | ✅ `usePermissions` + access denied UI | ❌ Missing |
| **Unsaved changes** | ✅ `useUnsavedChangesWarning(isDirty, !isSubmitting)` | ❌ Missing |
| **Zod validation** | ✅ `zodResolver(createSchema)` | ❌ Manual validation |
| **Submit error display** | ✅ Card with `border-status-error bg-status-error/5` | ❌ Missing (only mutation error) |
| **Loading state on mount** | ✅ Loader while permissions load | ❌ Missing |

### Inconsistencies Summary (Complete)

**Page-Level Issues:**
1. **Different page container** - Full-screen background vs standard padding
2. **Different max-width** - `max-w-7xl` vs `max-w-4xl`
3. **Different header structure** - Separate header bar vs inline header
4. **Different back link style** - Icon-only vs text+icon
5. **Different layout** - 2-column grid vs single-column cards
6. **Missing permission check** - No access control on service form
7. **Missing unsaved changes warning** - No navigation protection
8. **Manual validation** - Should use react-hook-form + Zod
9. **Missing submit error display** - No error card for API errors

**Form-Level Issues:**
10. **Card structure** - No separate header div with border
11. **Label styling** - Inline styles vs `.label` class
12. **Grid breakpoints** - Missing `md:` responsive breakpoint
13. **Action buttons** - Missing `items-center`, `pt-2`, Save icon, using Button vs Link

**Rich Text Editor Issues:**
14. **Two different implementations** - TipTap vs contentEditable
15. **Different feature sets** - Missing features on both sides
16. **Different styling approaches** - Design tokens vs hardcoded colors
17. **Different font defaults** - System font vs Arial
18. **Different font size units** - px vs pt
19. **minHeight variations** - 150, 380, 400 across different usages
20. **service-modal.tsx label styling** - Uses inline styles instead of `.label` class

### Key Design Changes

1. **Single Column Layout**: Replace 2-column grid with single column of section cards
2. **Standard Back Link**: Replace custom header bar with inline back link
3. **Narrower Container**: Use `max-w-4xl` instead of `max-w-7xl`
4. **Card Headers**: Each section has a proper card header with border
5. **Scope at Bottom**: Move Scope of Work to bottom as it's optional
6. **Consistent Spacing**: Use `space-y-6` between cards
7. **Enhanced Editor**: Rich text editor with full toolbar matching template editor

## Technical Notes

### Files to Modify

1. `src/app/(dashboard)/companies/[id]/contracts/[contractId]/services/new/page.tsx` - Main refactor
2. `src/app/(dashboard)/companies/[id]/contracts/[contractId]/services/[serviceId]/page.tsx` - Edit page alignment
3. `src/lib/validations/service.ts` - New Zod schema for service validation (create if not exists)
4. `src/components/ui/rich-text-editor.tsx` - Enhance toolbar to match A4PageEditor

### Dependencies

- `react-hook-form` - Already installed
- `@hookform/resolvers` - Already installed
- `zod` - Already installed
- All UI components already exist in `src/components/ui/`

### Validation Schema Structure

```typescript
// src/lib/validations/service.ts
import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  serviceType: z.enum(['RECURRING', 'ONE_TIME']),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'PENDING']),
  rate: z.number().nullable().optional(),
  currency: z.string().default('SGD'),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME']).optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  autoRenewal: z.boolean().default(false),
  renewalPeriodMonths: z.number().nullable().optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
```

### Rich Text Editor Enhancement Approach

**Option A: Enhance existing RichTextEditor (Recommended)**
- Add missing features to the TipTap-based editor
- Pros: TipTap is more modern, better React integration
- Cons: May require additional TipTap extensions

**Option B: Create shared toolbar configuration**
- Extract toolbar config to shared constants
- Both editors use same options but different implementations
- Pros: Gradual migration possible
- Cons: Two implementations to maintain

**Option C: Migrate A4PageEditor to TipTap**
- Rewrite A4PageEditor using TipTap
- Pros: Single implementation
- Cons: Significant effort, risk of regression

Recommendation: **Option A** - Enhance the existing RichTextEditor with additional TipTap extensions for font family, text alignment, line spacing, and indent/outdent.

## Success Metrics

1. **Visual Consistency**: Service form visually matches Company/Contact forms when viewed side-by-side
2. **Code Consistency**: Form uses same patterns (react-hook-form, Zod, useUnsavedChangesWarning)
3. **Editor Consistency**: Rich text toolbars have matching capabilities across the application
4. **No Regressions**: All existing functionality works (create, edit, validation, submission)
5. **TypeScript Clean**: No type errors in modified files

## Open Questions

1. Should the Scope of Work section be collapsible to reduce initial form length?
2. Should font size use `pt` units consistently (for PDF export compatibility) or `px` (for web consistency)?
3. Should we add a "preview" button for the scope rich text content?
4. Should the rich text editor have a minimum toolbar (compact mode) vs full toolbar toggle?

---

## Implementation Checklist

### Phase 1: Page Layout & Form Refactor
- [ ] Story 1: Consistent Page Header Layout
- [ ] Story 2: Reorganized Form Sections
- [ ] Story 3: Form State Management with react-hook-form
- [ ] Story 4: Consistent Form Input Styling
- [ ] Story 5: Action Buttons Placement
- [ ] Story 6: Conditional Field Display
- [ ] Story 7: Edit Service Page Consistency

### Phase 2: Rich Text Editor Enhancement
- [ ] Story 8: Standardized Rich Text Editor Toolbar
- [ ] Story 9: Scope of Work Editor Enhancements

### Phase 3: Consistency Cleanup
- [ ] Story 10: Service Modal Consistency (Legacy Component)
- [ ] Story 11: A4PageEditor Design Token Alignment
