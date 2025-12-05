# Oakcloud Design Guidelines

This document outlines the design system, UI components, and styling standards for the Oakcloud application.

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Design Principles](#design-principles)
- [Typography](#typography)
- [Color Palette](#color-palette)
- [Spacing System](#spacing-system)
- [Component Specifications](#component-specifications)
- [CSS Classes Reference](#css-classes-reference)
- [UI Consistency Standards](#ui-consistency-standards)
- [Reusable Components](#reusable-components)
- [Layout Guidelines](#layout-guidelines)
- [Component Examples](#component-examples)

---

## Design Philosophy

Oakcloud follows a **sleek, modern, and compact** design philosophy inspired by Linear.app. The UI prioritizes information density while maintaining readability.

---

## Design Principles

1. **Compact & Dense** - Minimize whitespace, use smaller font sizes for data-heavy interfaces
2. **Subtle Interactions** - Muted hover states, smooth transitions (150ms)
3. **Light/Dark Mode** - Full theme support with light mode as default, carefully tuned contrast for both modes
4. **Consistent Spacing** - Use the 4px grid system (4, 8, 12, 16, 20, 24, 32px)
5. **Minimal Borders** - Prefer subtle borders over shadows for separation (shadows enabled in light mode for depth)

---

## Typography

### Font Scale

Balanced font sizes for modern, readable interfaces:

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-2xs` | 11px | 16px | Timestamps, metadata |
| `text-xs` | 12px | 18px | Labels, badges, captions |
| `text-sm` | 13px | 20px | Body text, inputs, buttons |
| `text-base` | 14px | 24px | Primary content |
| `text-lg` | 16px | 26px | Section headers |
| `text-xl` | 18px | 28px | Page subtitles |
| `text-2xl` | 20px | 30px | Page titles |
| `text-3xl` | 24px | 34px | Hero text |

### Font Families

- **Sans**: Inter (UI text)
- **Mono**: JetBrains Mono (code blocks, technical IDs)

---

## Color Palette

The application supports both light and dark modes with CSS variables. Light mode is the default.

### Light Mode (Default)

```css
/* Primary Brand (Teal-Green) */
--oak-primary: #294d44;    /* Buttons, active states */
--oak-hover: #23423a;      /* Button hover */
--oak-light: #3a6b5f;      /* Accent text, links */
--oak-dark: #1f3a33;       /* Button active/pressed */

/* Backgrounds (Soft off-white tones) */
--bg-primary: #f8f9fb;     /* Page background (soft gray) */
--bg-secondary: #ffffff;   /* Cards, sidebar (white) */
--bg-tertiary: #f1f3f5;    /* Hover states, table headers */
--bg-elevated: #ffffff;    /* Dropdowns, elevated cards */

/* Borders */
--border-primary: #e2e4e9; /* Default borders */
--border-secondary: #d0d3d9; /* Emphasized borders */
--border-focus: #294d44;   /* Focus rings */

/* Text */
--text-primary: #1a1d23;   /* Primary content */
--text-secondary: #5c6370; /* Secondary text */
--text-tertiary: #7d838f;  /* Placeholder, disabled */
--text-muted: #a0a5b0;     /* Muted, decorative */
```

### Dark Mode

```css
/* Primary Brand (Teal-Green) */
--oak-primary: #294d44;    /* Buttons, active states */
--oak-hover: #3a6b5f;      /* Button hover */
--oak-light: #4a8b7f;      /* Accent text, links */
--oak-dark: #1f3a33;       /* Button active/pressed */

/* Backgrounds (Darkest to Lightest) */
--bg-primary: #0d0d0d;     /* Page background */
--bg-secondary: #141414;   /* Cards, sidebar */
--bg-tertiary: #1a1a1a;    /* Hover states, table headers */
--bg-elevated: #212121;    /* Dropdowns, elevated cards */

/* Borders */
--border-primary: #2a2a2a; /* Default borders */
--border-secondary: #333;  /* Emphasized borders */
--border-focus: #294d44;   /* Focus rings */

/* Text */
--text-primary: #ffffff;   /* Primary content */
--text-secondary: #a1a1a1; /* Secondary text */
--text-tertiary: #6b6b6b;  /* Placeholder, disabled */
--text-muted: #525252;     /* Muted, decorative */
```

### Status Colors (Both Modes)

```css
--status-success: #22c55e; /* Success states */
--status-warning: #eab308; /* Warning states */
--status-error: #ef4444;   /* Error states */
--status-info: #3b82f6;    /* Info states */
```

### Theme Toggle

Users can switch themes via the toggle in the sidebar. The preference is persisted to localStorage.

---

## Spacing System

Based on a 4px grid system:

| Token | Value | Usage |
|-------|-------|-------|
| `p-1` | 4px | Icon padding |
| `p-2` | 8px | Compact elements |
| `p-3` | 12px | Card padding, nav items |
| `p-4` | 16px | Section padding |
| `p-6` | 24px | Page padding |
| `gap-1` | 4px | Icon + text |
| `gap-2` | 8px | Related elements |
| `gap-4` | 16px | Sections |

---

## Component Specifications

### Buttons

| Size | Height | Padding | Font | Border Radius | Use Case |
|------|--------|---------|------|---------------|----------|
| `xs` | 28px | 12px | 12px | 4px | Inline actions, table rows |
| `sm` | 32px | 16px | 13px | 4px | Default, most actions |
| `md` | 36px | 20px | 13px | 4px | Primary actions, forms |
| `lg` | 40px | 24px | 14px | 6px | Hero CTAs |

### Inputs

| Size | Height | Padding | Font | Border Radius | Use Case |
|------|--------|---------|------|---------------|----------|
| `xs` | 28px | 12px | 12px | 4px | Compact filters |
| `sm` | 32px | 12px | 13px | 4px | Table inline edit |
| `md` | 36px | 14px | 13px | 4px | Default forms |
| `lg` | 40px | 16px | 14px | 6px | Login, prominent inputs |

---

## CSS Classes Reference

### Buttons

```css
/* Variants (combine with size) */
.btn-primary    /* Oak green, white text */
.btn-secondary  /* Dark bg, border, white text */
.btn-ghost      /* Transparent, text only */
.btn-danger     /* Red tint for destructive */

/* Sizes */
.btn-xs / .btn-sm / .btn-md / .btn-lg

/* Modifiers */
.btn-icon       /* Square icon-only button */
```

### Inputs

```css
.input          /* Base input styles */
.input-xs / .input-sm / .input-md / .input-lg
.input-error    /* Red border for errors */
```

### Labels

```css
.label          /* Form labels (12px, medium) */
.label-sm       /* Small labels (10px) */
```

### Cards

```css
.card           /* bg-secondary, subtle border */
.card-elevated  /* bg-elevated, shadow */
```

### Badges

```css
.badge          /* Base (10px, pill-shaped) */
.badge-success  /* Green - active, linked */
.badge-warning  /* Yellow - pending, caution */
.badge-error    /* Red - error, failed */
.badge-info     /* Blue - informational */
.badge-neutral  /* Gray - inactive, default */
```

### Tables

```css
.table-container  /* Scrollable wrapper */
.table            /* Full table styles */
.table th         /* Uppercase, 10px, tertiary */
.table td         /* 13px, primary text */
```

#### Table Selection Pattern

For tables with bulk selection, place the "select all" checkbox in the **table header (`<th>`)**, not above the table.

```tsx
import { Checkbox } from '@/components/ui/checkbox';

// Compute selection states
const isAllSelected = items.length > 0 && selectedIds.size === items.length;
const isIndeterminate = selectedIds.size > 0 && selectedIds.size < items.length;

<table className="table">
  <thead>
    <tr>
      <th className="w-10">
        <Checkbox
          size="sm"
          checked={isAllSelected}
          indeterminate={isIndeterminate}
          onChange={toggleSelectAll}
          aria-label="Select all"
        />
      </th>
      <th>Name</th>
      {/* ... */}
    </tr>
  </thead>
  <tbody>
    {items.map((item) => (
      <tr key={item.id} className={selectedIds.has(item.id) ? 'bg-oak-primary/5' : ''}>
        <td>
          <Checkbox
            size="sm"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleSelection(item.id)}
            aria-label={`Select ${item.name}`}
          />
        </td>
        {/* ... */}
      </tr>
    ))}
  </tbody>
</table>
```

**Key points:**
- Use `size="sm"` for table checkboxes
- Support `indeterminate` state for partial selection
- Highlight selected rows with `bg-oak-primary/5`
- Show bulk action buttons conditionally when items are selected

### Navigation

```css
.nav-item         /* Sidebar item (12px) */
.nav-item-active  /* Active state with oak tint */
```

### Utilities

```css
.divider          /* Horizontal rule */
.section-title    /* Uppercase label (10px) */
.skeleton         /* Loading placeholder */
```

---

## UI Consistency Standards

All pages follow these consistency standards for a unified look and feel:

| Element | Standard Class |
|---------|---------------|
| Buttons | `btn-{variant} btn-sm` (use `btn-sm` by default) |
| Inputs | `input input-sm` |
| Page Padding | `p-4 sm:p-6` (responsive) |
| Page Headers | `text-xl sm:text-2xl font-semibold text-text-primary` |
| Description Text | `text-sm text-text-secondary mt-1` |
| Back Links | `text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors` |
| Error Messages | `text-xs text-status-error mt-1.5` |
| Card Headers | `p-4 border-b border-border-primary` |
| Form Labels | `label` class (12px, medium weight) |

---

## Reusable Components

Located in `src/components/ui/`. These components use **Chakra UI** primitives with custom styling to match the Oakcloud design system.

### Core Components

| Component | Props | Description |
|-----------|-------|-------------|
| `Button` | `variant`, `size`, `isLoading`, `iconOnly`, `leftIcon`, `rightIcon` | Chakra-based button with oak theme |
| `FormInput` | `label`, `error`, `hint`, `inputSize`, `leftIcon`, `rightIcon` | Chakra Input with validation |
| `DateInput` | `label`, `value`, `onChange`, `error`, `hint`, `size`, `disabled` | Segmented date input (DD/MM/YYYY) with calendar picker |
| `Alert` | `variant`, `title`, `compact`, `onClose` | Chakra Box-based notifications |
| `Modal` | `isOpen`, `onClose`, `title`, `size`, `closeOnEscape` | Accessible modal dialog |
| `ConfirmDialog` | `title`, `description`, `variant`, `requireReason` | Confirmation dialog with optional reason input |
| `Dropdown` | Composable: `Trigger`, `Menu`, `Item`, `align` | Portal-rendered dropdown (prevents clipping in tables) |
| `Pagination` | `page`, `totalPages`, `total`, `limit`, `onPageChange`, `onLimitChange` | Table pagination with page size selector |
| `Checkbox` | `indeterminate`, `label`, `description`, `size` | Checkbox with indeterminate state for bulk selection |

### Form Utilities

| Hook | Props | Description |
|------|-------|-------------|
| `useUnsavedChangesWarning` | `isDirty`, `enabled` | Browser warning when leaving page with unsaved form changes |

**Usage:**
```tsx
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';

function EditForm() {
  const { formState: { isDirty, isSubmitting } } = useForm();

  // Warn when form has unsaved changes (disabled during submit)
  useUnsavedChangesWarning(isDirty, !isSubmitting);

  return <form>...</form>;
}
```

### Utility Components

| Component | Props | Description |
|-----------|-------|-------------|
| `Toast` | Via `useToast()` hook | Toast notifications (success, error, warning, info) |
| `Sidebar` | - | Responsive navigation with mobile drawer and theme toggle |
| `AuthGuard` | - | Route protection wrapper |
| `ErrorBoundary` | `fallback`, `onError` | React error boundary with fallback UI |
| `ThemeProvider` | - | Theme context provider, applies theme class to document |
| `ThemeToggle` | `variant` | Theme switcher (button or dropdown variant) |
| `TenantSelector` | `value`, `onChange`, `label`, `placeholder`, `helpText`, `variant` | Tenant dropdown for SUPER_ADMIN operations |
| `AIModelSelector` | `value`, `onChange`, `showContextInput`, `showStandardContexts`, etc. | AI model selection with optional context input |

### Table Pagination Guidelines

**All table views MUST include the Pagination component** with both page navigation and page size selector.

#### Required Implementation Pattern

```tsx
// 1. Add state for pagination
const [page, setPage] = useState(1);
const [limit, setLimit] = useState(20);

// 2. Use in API query
const { data } = useData({ page, limit, ...filters });

// 3. Include Pagination component after table
{data && data.totalPages > 0 && (
  <div className="mt-4">
    <Pagination
      page={data.page}
      totalPages={data.totalPages}
      total={data.total}
      limit={data.limit}
      onPageChange={setPage}
      onLimitChange={(newLimit) => {
        setLimit(newLimit);
        setPage(1); // Reset to first page when changing limit
      }}
    />
  </div>
)}
```

#### Page Size Options

- Available options: **10, 20, 50, 100, 200**
- Default: **20** for most tables, **50** for audit logs
- Maximum API limit: **200** (enforced by Zod validation)

#### Pagination Component Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `page` | number | Yes | Current page number |
| `totalPages` | number | Yes | Total number of pages |
| `total` | number | Yes | Total number of records |
| `limit` | number | Yes | Current page size |
| `onPageChange` | (page: number) => void | Yes | Page change handler |
| `onLimitChange` | (limit: number) => void | No | Page size change handler |
| `showPageSize` | boolean | No | Show/hide page size selector (default: true) |

#### Display Rules

- Always show pagination when `totalPages > 0` (even for single page)
- Shows "Showing X to Y of Z results" with page size dropdown
- Page numbers with ellipsis for large page counts
- Previous/Next arrows disabled at boundaries

---

## Layout Guidelines

### Sidebar

- Width: `224px` (expanded), `56px` (collapsed)
- Nav items: `13px` font, `8px` vertical padding
- Logo: `28px` icon, `14px` text
- Icons: `18px`

### Page Content

- Main content: `ml-56` (224px left margin)
- Page padding: `p-4` to `p-6`
- Max content width: None (fluid)

### Cards & Sections

- Card padding: `p-3` (compact) to `p-4` (standard)
- Section gaps: `space-y-4` to `space-y-6`
- Border radius: `4px` (default), `6px` (cards, large buttons)

---

## Component Examples

### Button

```tsx
import { Button } from '@/components/ui/button';

// Standard button
<Button variant="primary" size="sm">Save</Button>

// With loading state
<Button isLoading>Saving...</Button>

// Icon button
<Button variant="ghost" size="sm" iconOnly leftIcon={<Plus />} />

// Danger action
<Button variant="danger" size="xs" leftIcon={<Trash />}>Delete</Button>
```

### FormInput

```tsx
import { FormInput } from '@/components/ui/form-input';

// Basic input
<FormInput label="Email" type="email" placeholder="you@example.com" />

// With icon and error
<FormInput
  label="Password"
  type="password"
  inputSize="md"
  leftIcon={<Lock />}
  error="Password is required"
/>
```

### DateInput

```tsx
import { DateInput } from '@/components/ui/date-input';

// Basic date input
<DateInput
  label="Date of Birth"
  value={dateValue}  // YYYY-MM-DD format
  onChange={(val) => setDateValue(val)}
/>

// Compact size with hint
<DateInput
  label="Appointment Date"
  value={appointmentDate}
  onChange={setAppointmentDate}
  size="sm"
  hint="Leave empty if not applicable"
/>

// With error
<DateInput
  label="Start Date"
  value={startDate}
  onChange={setStartDate}
  error="Start date is required"
  required
/>
```

**Features:**
- Segmented DD/MM/YYYY input with auto-advance between fields
- Calendar picker popup (click calendar icon)
- Month/year quick selection in calendar
- Keyboard navigation (Tab, /, -, Backspace)
- Sizes: `sm` (compact) and `md` (default)

### Alert

```tsx
import { Alert } from '@/components/ui/alert';

// Error alert
<Alert variant="error">Invalid credentials</Alert>

// Success with title
<Alert variant="success" title="Saved">Company updated successfully</Alert>

// Compact variant
<Alert variant="info" compact>Processing...</Alert>
```

### Modal & ConfirmDialog

```tsx
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Basic modal
<Modal isOpen={isOpen} onClose={onClose} title="Edit Company">
  <ModalBody>Content here</ModalBody>
  <ModalFooter>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onSave}>Save</Button>
  </ModalFooter>
</Modal>

// Delete confirmation with reason
<ConfirmDialog
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={(reason) => handleDelete(reason)}
  title="Delete Company"
  description="This action cannot be undone."
  variant="danger"
  requireReason
  reasonMinLength={10}
/>
```

### Dropdown

```tsx
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';

<Dropdown>
  <DropdownTrigger>Options</DropdownTrigger>
  <DropdownMenu>
    <DropdownItem icon={<Edit />} onClick={onEdit}>Edit</DropdownItem>
    <DropdownItem icon={<Trash />} destructive onClick={onDelete}>Delete</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

### Toast

```tsx
import { useToast } from '@/components/ui/toast';

function MyComponent() {
  const { success, error, warning, info } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      success('Data saved successfully');
    } catch (err) {
      error('Failed to save data');
    }
  };
}
```

### TenantSelector

```tsx
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';

function AdminPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const [selectedTenantId, setSelectedTenantId] = useState('');

  // Get active tenant (session tenant for normal users, selected for SUPER_ADMIN)
  const activeTenantId = useActiveTenantId(isSuperAdmin, selectedTenantId, session?.tenantId);

  return (
    <>
      {/* Default variant with card wrapper */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          helpText="Select a tenant to manage."
        />
      )}

      {/* Compact variant without card wrapper */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          variant="compact"
        />
      )}
    </>
  );
}
```

---

## Best Practices

### Number Input Fields (Controlled Components)

When using controlled number inputs with `useState`, store the value as a **string** and convert to number only on form submission. This prevents the input from reverting to its default value when the user clears the field.

```typescript
// BAD: Value reverts immediately when field is cleared
const [maxUsers, setMaxUsers] = useState(50);

<input
  type="number"
  value={maxUsers}
  onChange={(e) => setMaxUsers(parseInt(e.target.value) || 50)}
/>

// GOOD: Store as string, parse on submit
const [maxUsers, setMaxUsers] = useState('50');

<input
  type="number"
  value={maxUsers}
  onChange={(e) => setMaxUsers(e.target.value)}
/>

// On form submit:
const handleSubmit = () => {
  const data = {
    maxUsers: parseInt(maxUsers) || 50,  // Apply default here
  };
};
```

**Note**: This issue doesn't apply when using `react-hook-form` with `{ valueAsNumber: true }`, which handles the conversion correctly.

---

## File Structure

```
src/components/ui/
├── alert.tsx              # Alert/notification component
├── ai-model-selector.tsx  # AI model selection with context
├── button.tsx             # Button component with variants
├── checkbox.tsx           # Checkbox with indeterminate state
├── confirm-dialog.tsx     # Confirmation dialog with reason
├── date-input.tsx         # Segmented date input with calendar picker
├── dropdown.tsx           # Portal-rendered dropdown menu
├── form-input.tsx         # Form input with validation
├── modal.tsx              # Accessible modal dialog
├── pagination.tsx         # Table pagination component
├── sidebar.tsx            # Responsive navigation sidebar
├── stepper.tsx            # Multi-step wizard component
├── tenant-selector.tsx    # Tenant dropdown for admins
├── theme-toggle.tsx       # Theme switcher component
└── toast.tsx              # Toast notification system

src/hooks/
├── use-unsaved-changes.ts # Browser warning for unsaved form changes
└── ...                    # Other application hooks
```
