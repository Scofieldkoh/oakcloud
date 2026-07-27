# Tasks and Pipelines UI Consistency Design

**Date:** 2026-07-27  
**Status:** Approved  
**Scope:** Visual hierarchy, spacing, and component consistency for the Tasks and Pipelines modules

## Goal

Bring Tasks and Pipelines into visual alignment with Oakcloud's established Companies and Contacts modules. The work improves page gutters, section rhythm, control spacing, content grouping, and responsive presentation without changing the modules' data model, APIs, permissions, or workflows.

## Design Direction

Use the existing Oakcloud list-module language as the source of truth:

- Responsive page gutters of `p-4 sm:p-6`
- Page headers with responsive title sizing, supporting copy, and right-aligned actions
- A 24px rhythm between primary page sections
- Compact controls that follow the existing 4px spacing grid
- Subtle bordered surfaces instead of decorative shadows or nested cards
- Existing semantic colors, typography tokens, buttons, forms, tables, empty states, and mobile card conventions
- Full light and dark theme support

This is a consistency pass, not a new visual identity. It does not add statistics, dashboards, or decorative presentation.

## Tasks Workspace

### Page Shell and Header

- Wrap the workspace in the same `p-4 sm:p-6` responsive gutter used by Companies and Contacts.
- Use a 24px gap after the page header and between the filter, feedback, table, and pagination regions.
- Keep the existing title, description, Manage pipelines action, and Create task action.
- Match peer-module action wrapping and spacing so controls remain aligned on desktop and form a clean row or stack on smaller screens.

### Filters

- Present search and filters as one compact, coherent toolbar using existing Oakcloud input and select styling.
- Keep all existing filters and filtering behavior.
- Allow controls to wrap predictably without uneven widths or isolated controls.
- Show active filters with the established filter-chip treatment and a clear-all action when filters are active.
- Preserve mobile touch targets and ensure the toolbar never causes page-level horizontal overflow.

### Task Results

- Retain the required desktop column order: Company, Task, Stages, Owner, Due, Actions.
- Keep horizontal overflow on the table container only.
- Use the established table container, header, row, hover, and border treatments from other list modules.
- Preserve the complete inline stage icon sequence and all existing accessibility labels.
- Keep status badges, owner avatars, due-date states, and row actions, but normalize their alignment and internal gaps.
- Use the shared pagination pattern and align it with the table surface.
- Keep the existing mobile card presentation while normalizing card padding and gaps to the responsive table conventions.

### Loading, Empty, and Error States

- Use the same surface width, padding, icon scale, typography, and vertical placement as Companies and Contacts.
- Preserve existing messages and task actions unless a copy change is required for consistency or accessibility.

## Pipelines Workspace

### List Page

- Apply the same responsive page shell and 24px section rhythm as the Tasks and peer list pages.
- Keep the existing title, description, and Create pipeline action.
- Retain the current responsive collection layout, but make pipeline entries visually quieter and more structured.
- Align the icon, name, description, stage count, version, and actions to a consistent internal grid.
- Keep Edit as the primary row/card action and Duplicate and Archive as secondary actions.
- Preserve the current empty, loading, error, duplicate, and archive behavior.

### Pipeline Builder

- Use the standard responsive page gutter around the builder and a focused content width that remains comfortable for form entry.
- Keep the header and Save/Cancel actions visible in a predictable position using the same responsive action layout as other forms.
- Separate pipeline identity from stage configuration with a clear section boundary.
- Keep ordered stage cards, drag-and-drop, keyboard movement, add, remove, and reorder behavior.
- Within each stage, organize existing controls into five visual groups:
  1. Stage identity: name and description
  2. Behavior: action type and required/optional setting
  3. Appearance: curated icon selection
  4. Action configuration: company, document, or e-signing settings when applicable
  5. Checklist: checklist items and add/remove actions
- Use spacing, dividers, and restrained secondary backgrounds to distinguish groups. Do not introduce nested decorative cards.
- Keep validation feedback close to the affected section and retain a summary at the top when submission fails.
- Do not change pipeline versioning, validation rules, adapter configuration, or save behavior.

## Component Boundaries

The implementation should preserve the existing feature boundaries:

- `TaskWorkspace` owns page-level state, queries, mutations, dialogs, and page composition.
- `TaskFilters` owns task filter controls and active-filter presentation.
- `TaskList` owns desktop table and mobile card rendering.
- `TaskStagePipeline` owns the inline stage sequence.
- Pipeline list components own pipeline collection presentation.
- `PipelineBuilder` owns draft editing, validation, ordering, and stage composition.

Small focused presentation components may be extracted when they remove repeated markup or make spacing rules explicit. No unrelated component or service refactor is included.

## Data Flow and Behavior

No data flow changes are required:

- Existing TanStack Query hooks remain authoritative.
- Existing create, edit, transition, duplicate, archive, pause, resume, cancel, and delete mutations remain unchanged.
- Existing modal and confirmation flows remain unchanged.
- Existing URL routes, API payloads, permissions, and task/pipeline service behavior remain unchanged.

The UI may introduce local presentation state only where needed for progressive disclosure or responsive controls. Such state must not alter saved data.

## Accessibility and Responsive Behavior

- Maintain semantic page headings, sections, tables, labels, and buttons.
- Preserve keyboard drag-and-drop and explicit move controls in the Pipeline builder.
- Keep visible focus states using Oakcloud focus tokens.
- Use a minimum 44px touch target on mobile where controls are isolated.
- Prevent page-level horizontal scrolling; only the desktop task table may scroll horizontally.
- Preserve text labels or accessible names for icon-only controls.
- Verify light mode, dark mode, desktop, tablet wrapping, and mobile card layouts.

## Error Handling

- Continue using existing Oakcloud alerts and confirmation dialogs.
- Loading, query failure, mutation failure, empty results, and validation failure must each remain distinct.
- Reflowing or grouping controls must not hide validation messages or mutation errors.
- Destructive actions remain visually secondary until confirmation.

## Testing and Verification

### Automated Checks

- Update component tests only where presentation structure or accessible labeling changes.
- Preserve contract tests for task column order, table overflow ownership, stage accessibility, optional task fields, and pipeline routes.
- Add focused tests for the page gutter, filter/result grouping, and builder section structure when these can be asserted without coupling tests to incidental Tailwind class ordering.
- Run focused Tasks and Pipelines component tests, TypeScript, and ESLint for changed files.

### Browser Checks

- Compare Tasks, Pipelines, Companies, and Contacts at the same desktop viewport.
- Verify consistent outer gutters, header baseline, section rhythm, toolbar height, table/card padding, and pagination spacing.
- Verify Tasks at mobile width, including filter wrapping and cards.
- Verify the Pipeline list and builder at mobile width, including stage controls and action wrapping.
- Exercise the core paths: filter tasks, open a stage, create/edit a task, create/edit/reorder a pipeline, and trigger validation.
- Inspect light and dark themes.

## Out of Scope

- New statistics, dashboard cards, or reporting
- New task or pipeline functionality
- API, database, permission, or service changes
- Changes to task status colors or stage status rules
- Changes to pipeline versioning or adapter behavior
- Redesigns of unrelated Oakcloud modules
