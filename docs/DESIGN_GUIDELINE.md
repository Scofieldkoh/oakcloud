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
  - [Page Layout Patterns](#page-layout-patterns)
  - [Button Icon Pattern](#button-icon-pattern)
  - [TenantSelector Placement](#tenantselector-placement)
  - [Empty States for SUPER_ADMIN](#empty-states-for-super_admin)
- [Reusable Components](#reusable-components)
- [Layout Guidelines](#layout-guidelines)
- [Component Examples](#component-examples)
- [Best Practices](#best-practices)

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

### Toggle Switch

Use toggle switches for binary on/off settings. Prefer toggle switches over checkboxes for:
- Feature enable/disable settings
- Active/inactive status toggles
- Boolean preferences with descriptive labels

**When to use Toggle Switch vs Checkbox:**

| Use Toggle Switch | Use Checkbox |
|-------------------|--------------|
| Enable/disable a feature | Multi-select in tables |
| Active/inactive status | Boolean form fields |
| Settings with clear on/off state | Inline filter toggles |
| Has descriptive subtitle | Simple yes/no without description |

**Standard Toggle Switch Pattern:**

```tsx
// Full toggle switch with card container, title, and description
<div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
  <div className="flex flex-col">
    <span className="text-sm font-medium text-text-primary">Setting Name</span>
    <span className="text-xs text-text-muted">
      {isEnabled ? 'Description when enabled' : 'Description when disabled'}
    </span>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={isEnabled}
    onClick={() => setIsEnabled(!isEnabled)}
    className={cn(
      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
      isEnabled ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
        isEnabled ? 'translate-x-5' : 'translate-x-0'
      )}
    />
  </button>
</div>
```

**Compact Toggle Switch (inline):**

```tsx
// Inline toggle without card container
<label className="flex items-center gap-3 cursor-pointer">
  <button
    type="button"
    role="switch"
    aria-checked={isEnabled}
    onClick={() => setIsEnabled(!isEnabled)}
    className={cn(
      'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
      isEnabled ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
        isEnabled ? 'translate-x-4' : 'translate-x-0'
      )}
    />
  </button>
  <span className="text-sm text-text-primary">Setting label</span>
</label>
```

**Key Features:**
- iOS-style sliding toggle animation
- Oak primary (`bg-oak-primary` / `#294d44`) when enabled
- Gray (`bg-gray-300` light / `bg-gray-600` dark) when disabled
- White knob with shadow (`shadow-md`) for visibility
- Proper accessibility with `role="switch"` and `aria-checked`
- Focus ring for keyboard navigation
- Smooth 200ms transition

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

### Floating Bulk Actions Toolbar

When items are selected via checkboxes in a table, display a **floating action bar** at the bottom of the screen. This provides a consistent, prominent way to perform bulk operations across all list views.

**Key Features:**
- Fixed position at bottom center of the viewport
- Slides in with animation when items are selected
- Shows selection count with clear button
- Action buttons with icons and labels
- Color-coded actions (default, warning, danger)
- Confirmation dialogs for destructive actions

**Standard Pattern:**

```tsx
import { X, Download, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  className?: string;
}

// Define operations with configuration
const operations = [
  { id: 'DOWNLOAD', label: 'Download', icon: Download, variant: 'default', requiresConfirmation: false },
  { id: 'APPROVE', label: 'Approve', icon: CheckCircle, variant: 'default', requiresConfirmation: true },
  { id: 'DELETE', label: 'Delete', icon: Trash2, variant: 'danger', requiresConfirmation: true },
];

function BulkActionsToolbar({ selectedIds, onClearSelection, className }: BulkActionsToolbarProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-40',
        'bg-background-primary border border-border-primary rounded-lg shadow-xl',
        'flex items-center gap-2 px-4 py-3',
        'animate-in slide-in-from-bottom-4',
        className
      )}
    >
      {/* Selection count */}
      <div className="flex items-center gap-2 pr-3 border-r border-border-primary">
        <span className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{selectedIds.length}</span> selected
        </span>
        <button
          onClick={onClearSelection}
          className="btn-ghost btn-xs p-1"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {operations.map((op) => {
          const Icon = op.icon;
          return (
            <button
              key={op.id}
              onClick={() => handleOperation(op.id)}
              className={cn(
                'btn-sm flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors',
                op.variant === 'danger'
                  ? 'hover:bg-status-error/10 hover:text-status-error text-text-secondary'
                  : op.variant === 'warning'
                  ? 'hover:bg-status-warning/10 hover:text-status-warning text-text-secondary'
                  : 'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary'
              )}
              title={op.description}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{op.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Usage in Pages:**

```tsx
// State management
const [selectedIds, setSelectedIds] = useState<string[]>([]);

const clearSelection = useCallback(() => {
  setSelectedIds([]);
}, []);

// Clear selection when filters/page changes
useEffect(() => {
  setSelectedIds([]);
}, [params]);

// Render at the bottom of the page (outside any scrollable container)
return (
  <div className="p-4 sm:p-6">
    {/* ... table with checkboxes ... */}

    {/* Floating bulk actions - always at root level */}
    <BulkActionsToolbar
      selectedIds={selectedIds}
      onClearSelection={clearSelection}
    />
  </div>
);
```

**When to Use:**
| Use Floating Toolbar | Use Inline Actions |
|---------------------|-------------------|
| Multiple bulk actions available | Single action only |
| Actions require prominent visibility | Actions are secondary |
| Table has pagination | Short, non-paginated lists |
| User may scroll while selecting | Content fits on screen |

**Styling Guidelines:**
- Background: `bg-background-primary` with `border-border-primary`
- Shadow: `shadow-xl` for elevation
- Animation: `animate-in slide-in-from-bottom-4`
- Z-index: `z-40` (above content, below modals)
- Position: `fixed bottom-6 left-1/2 -translate-x-1/2`

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

### Page Layout Patterns

The application uses three distinct page patterns:

#### 1. Main List Pages (Companies, Contacts, Documents)

These are top-level navigation pages that display lists of items.

```tsx
<div className="p-4 sm:p-6">
  {/* Header - NO icon in title */}
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
        Page Title
      </h1>
      <p className="text-sm text-text-secondary mt-1">
        Description text here
      </p>
    </div>
    <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
      Add Item
    </Button>
  </div>

  {/* TenantSelector for SUPER_ADMIN (after header) */}
  {session?.isSuperAdmin && (
    <div className="mb-6">
      <TenantSelector value={...} onChange={...} />
    </div>
  )}

  {/* Filters */}
  {/* Content */}
</div>
```

#### 2. Admin List Pages (Tenants, Roles, Users, Templates)

These are admin-specific pages under `/admin/*` that manage system resources.

```tsx
<div className="p-4 sm:p-6">
  {/* Header - WITH icon in title */}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
        <IconName className="w-6 h-6" />
        Page Title
      </h1>
      <p className="text-sm text-text-secondary mt-1">
        Description text here
      </p>
    </div>
    <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={...}>
      Add Item
    </Button>
  </div>

  {/* TenantSelector for SUPER_ADMIN (after header) */}
  {session?.isSuperAdmin && (
    <div className="mb-6">
      <TenantSelector value={...} onChange={...} />
    </div>
  )}

  {/* Filters */}
  {/* Content */}
</div>
```

**Admin page icons:**
| Page | Icon |
|------|------|
| Tenants | `Building` |
| Roles | `Shield` |
| Users | `UserCog` (in sidebar) |
| Templates | `FileText` (combined page with Document Templates and Partials tabs) |
| Audit Logs | `Activity` |
| Connectors | `Plug` |

#### 3. Detail/Form/Wizard Pages

These are pages accessed via ID or for specific actions (view, edit, create).

```tsx
<div className="min-h-screen bg-background-primary">
  {/* Header with back button */}
  <div className="border-b border-border-primary bg-background-secondary">
    <div className="max-w-6xl mx-auto px-6 py-4">
      <div className="flex items-center gap-4">
        <Link href="/parent-page">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="h-6 w-px bg-border-secondary" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            Page Title
          </h1>
          <p className="text-sm text-text-muted">
            Subtitle or context
          </p>
        </div>
      </div>
    </div>
  </div>

  {/* Content */}
  <div className="max-w-6xl mx-auto px-6 py-8">
    {/* TenantSelector for SUPER_ADMIN (if applicable) */}
    {/* Page content */}
  </div>
</div>
```

#### 4. Full-Page Editor with Sidebars (e.g., Template Editor)

Complex editors with resizable sidebars and multiple tool panels.

```tsx
<div className="h-screen flex flex-col bg-background-primary">
  {/* Fixed Header */}
  <div className="flex-none border-b border-border-primary bg-background-secondary px-4 py-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-lg font-semibold">Editor Title</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary">Cancel</Button>
        <Button variant="primary">Save</Button>
      </div>
    </div>
  </div>

  {/* Main Content with Resizable Panels */}
  <div className="flex-1 flex overflow-hidden">
    {/* Left Panel - Collapsible */}
    <div style={{ width: leftPanelWidth }} className="flex-none border-r">
      {/* Tab navigation and content */}
    </div>

    {/* Resize Handle */}
    <div className="w-1 cursor-col-resize hover:bg-accent-primary/20" />

    {/* Center Editor */}
    <div className="flex-1 overflow-auto p-6">
      <RichTextEditor value={content} onChange={setContent} />
    </div>

    {/* Right Panel - Collapsible */}
    <div style={{ width: rightPanelWidth }} className="flex-none border-l">
      {/* Preview, AI Assistant, etc. */}
    </div>
  </div>
</div>
```

**Template Editor specific features:**
- **Left Panel Tabs**: Details (tenant selector for SUPER_ADMIN, name, category, description, active), Placeholders (with partials), Test Data (with company selector)
- **Right Panel Tabs**: Preview (live PDF preview), AI Assistant (with tenant context)
- **Resizable**: Both panels can be resized via drag handles (min: 200px, max: 500px)
- **Collapsible**: Both panels can be collapsed to icons-only mode
- **Placeholder Syntax Info**: Display via info icon with hover tooltip instead of inline text

### Button Icon Pattern

Use the `leftIcon` prop for buttons with icons (preferred over inline icons):

```tsx
// Preferred: Using leftIcon prop
<Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
  Add Item
</Button>

// Alternative: Inline icon (acceptable for Link-wrapped buttons)
<Link href="/path">
  <Button variant="primary" size="sm">
    <Plus className="w-4 h-4 mr-2" />
    Add Item
  </Button>
</Link>
```

### Centralized Tenant Selection for SUPER_ADMIN

Tenant selection for SUPER_ADMIN users is centralized in the **sidebar**. A "Select Tenant" button appears above the dark/light mode toggle, visible only to SUPER_ADMIN users. When clicked, it opens a modal with a searchable tenant list.

**Key benefits:**
1. **Single source of truth** - Selection persists across all pages via Zustand store with localStorage
2. **Consistent UX** - No repeated tenant selectors on each page
3. **Always accessible** - Visible in sidebar regardless of current page

**Usage in pages:**
```tsx
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';

function AdminPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.isSuperAdmin ?? false;

  // Get tenant selection from centralized store
  const { selectedTenantId, selectedTenantName } = useTenantSelection();

  // Get active tenant (session tenant for normal users, store value for SUPER_ADMIN)
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);

  // Fetch data using activeTenantId
  const { data } = useQuery({
    queryKey: ['resource', activeTenantId],
    queryFn: () => fetchData(activeTenantId),
    enabled: !!activeTenantId,
  });

  return <div>...</div>;
}
```

### Empty States for SUPER_ADMIN

When SUPER_ADMIN hasn't selected a tenant, show an appropriate empty state directing them to the sidebar:

```tsx
{session?.isSuperAdmin && !activeTenantId && (
  <div className="flex flex-col items-center justify-center py-12 text-text-muted">
    <IconName className="w-12 h-12 mb-3 opacity-50" />
    <p className="text-sm">Please select a tenant from the sidebar to view resources</p>
  </div>
)}
```

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
| `SidebarTenantButton` | `collapsed` | Sidebar button for SUPER_ADMIN tenant selection (opens modal) |
| `useTenantSelection` | - | Hook to access centralized tenant selection state |
| `useActiveTenantId` | `isSuperAdmin`, `sessionTenantId` | Hook to get active tenant (store value for SUPER_ADMIN, session for others) |
| `AIModelSelector` | `value`, `onChange`, `showContextInput`, `showStandardContexts`, etc. | AI model selection with optional context input |
| `RichTextEditor` | `value`, `onChange`, `placeholder`, `minHeight`, `autofocus` | TipTap-based rich text editor |
| `RichTextDisplay` | `content`, `className` | XSS-safe HTML renderer (DOMPurify sanitization) |
| `PrefetchLink` | `href`, `prefetchType`, `prefetchId`, ...LinkProps | Link with data prefetching on hover |

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

### Tenant Selection (Centralized)

Tenant selection for SUPER_ADMIN is centralized in the sidebar via Zustand store with localStorage persistence.

**Store (`src/stores/tenant-store.ts`):**
```tsx
interface TenantSelectionState {
  selectedTenantId: string;
  selectedTenantName: string | null;
  setSelectedTenant: (tenantId: string, tenantName?: string) => void;
  clearSelectedTenant: () => void;
}
```

**Hooks (`src/components/ui/tenant-selector.tsx`):**
```tsx
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';

function AdminPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.isSuperAdmin ?? false;

  // Access centralized tenant selection
  const { selectedTenantId, selectedTenantName, setSelectedTenant, clearSelectedTenant } = useTenantSelection();

  // Get active tenant (store value for SUPER_ADMIN, session tenant for others)
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);

  // Use activeTenantId for all tenant-scoped operations
  useEffect(() => {
    if (activeTenantId) {
      fetchDataForTenant(activeTenantId);
    }
  }, [activeTenantId]);

  // Show empty state if SUPER_ADMIN hasn't selected a tenant
  if (isSuperAdmin && !activeTenantId) {
    return (
      <div className="text-center py-12">
        <p>Please select a tenant from the sidebar</p>
      </div>
    );
  }

  return <div>...</div>;
}
```

**Sidebar Integration:**
The `SidebarTenantButton` component is automatically rendered in the sidebar for SUPER_ADMIN users, positioned above the theme toggle. When clicked, it opens `TenantSelectorModal` for tenant selection.

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
├── tenant-selector.tsx    # Tenant selection (SidebarTenantButton, hooks, modal)
├── theme-toggle.tsx       # Theme switcher component
└── toast.tsx              # Toast notification system

src/stores/
├── ui-store.ts            # Zustand UI state (sidebar, theme)
└── tenant-store.ts        # SUPER_ADMIN tenant selection (persisted)

src/hooks/
├── use-unsaved-changes.ts # Browser warning for unsaved form changes
└── ...                    # Other application hooks
```
