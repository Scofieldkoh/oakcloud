# UI Consistency Assignment

> **Status**: Draft
> **Created**: 2026-01-13
> **Last Updated**: 2026-01-13
> **Related**: [DESIGN_GUIDELINE.md](./guides/DESIGN_GUIDELINE.md)

## Purpose

This document tracks specific UI inconsistencies discovered during the comprehensive review (Jan 2026) that need to be fixed in the existing codebase. Once all items are addressed, this file can be archived or removed.

## Overview

- **Total Inconsistencies**: 35+
- **Affected Files**: ~30 component files, 25+ pages
- **Completed**: 15 core issues (Critical: 5/5, High: 4/4, Medium: 6/9, Low: 2/2)
- **Status**: Core UI consistency work complete, remaining items deferred for future refactoring
- **Priority Levels**: Critical (🔴), High (🟠), Medium (🟡), Low (🟢)

---

## Category 1: Button Inconsistencies 🔴 CRITICAL

### Issue #1: Button Hierarchy Unclear
**Problem**: Primary/secondary button usage is inconsistent across pages.

**Affected Files**:
- [src/app/(dashboard)/companies/page.tsx](../src/app/(dashboard)/companies/page.tsx) (lines 237-238)
  - "Upload BizFile" uses white/secondary style
  - "Add Company" uses green/primary style
  - **Fix**: Both should be primary, or Upload should be secondary (decide based on usage frequency)

- [src/app/(dashboard)/companies/[id]/page.tsx](../src/app/(dashboard)/companies/[id]/page.tsx) (lines TBD)
  - "Update via BizFile", "Edit", "Delete" all use different variants
  - **Fix**: Apply hierarchy: "Edit" = primary, "Update via BizFile" = secondary, "Delete" = danger

**Action Items**:
- [x] Review all page headers and standardize button hierarchy
- [x] Update button variants to match DESIGN_GUIDELINE.md section "Button Hierarchy and Usage"
- [x] Ensure delete buttons use `variant="danger"` consistently

**Reference**: [DESIGN_GUIDELINE.md → Button Hierarchy and Usage](./guides/DESIGN_GUIDELINE.md)

---

### Issue #18: Keyboard Shortcuts Display
**Problem**: Buttons showing keyboard shortcuts have inconsistent formatting.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) (lines TBD)
  - "Refresh (R)" and "Upload (F2)" show shortcuts in parentheses
  - No consistent pattern for displaying shortcuts

**Action Items**:
- [ ] Create `<KbdShortcut>` component for consistent display
- [ ] Update all buttons with shortcuts to use new component
- [ ] Decide on placement: inline with text vs separate badge

**Reference**: [DESIGN_GUIDELINE.md → Button Hierarchy and Usage → Keyboard Shortcuts](./guides/DESIGN_GUIDELINE.md)

---

## Category 2: Typography Inconsistencies 🟠 HIGH

### Issue #5: Heading Hierarchy in Nested Contexts
**Problem**: Page headers use text-xl, but modal headers and card headers are inconsistent.

**Affected Files**:
- [src/components/ui/modal.tsx](../src/components/ui/modal.tsx) (line 122)
  - Modal title uses `text-lg` (16px)
  - **Fix**: This is correct per new guidelines, no change needed

- [src/app/(dashboard)/companies/page.tsx](../src/app/(dashboard)/companies/page.tsx) (lines 212-215)
  - Page title uses `text-xl sm:text-2xl`
  - **Fix**: This is correct, no change needed

- [src/app/(dashboard)/companies/new/page.tsx](../src/app/(dashboard)/companies/new/page.tsx) (lines TBD)
  - Section headers (h2) like "Basic Information" need consistent sizing
  - **Fix**: Apply `text-lg font-semibold` to all form section headers

**Action Items**:
- [x] Audit all form pages for section header consistency
- [x] Apply typography nesting rules from DESIGN_GUIDELINE.md
- [x] Update card headers to use consistent `text-lg font-semibold` size

**Reference**: [DESIGN_GUIDELINE.md → Typography Nesting Rules](./guides/DESIGN_GUIDELINE.md)

---

### Issue #11: Form Label Sizes
**Problem**: Form labels use inconsistent font sizes.

**Affected Files**:
- [src/components/ui/form-input.tsx](../src/components/ui/form-input.tsx) (line 33)
  - Label uses `gap: '1.5'` (0.375rem) - too small
  - **Fix**: Update to `gap-2` (0.5rem) for better spacing

- Various form pages (companies/new, contacts/new, etc.)
  - Check all form implementations for consistent label styling

**Action Items**:
- [x] Update FormInput component label spacing (gap: 1.5 → gap: 2)
- [x] Audit all forms for label size consistency
- [x] Ensure labels use `text-xs font-medium text-text-secondary` consistently

**Reference**: [DESIGN_GUIDELINE.md → Typography Nesting Rules → Form Labels](./guides/DESIGN_GUIDELINE.md)

---

## Category 3: Spacing Inconsistencies 🔴 CRITICAL

### Issue #3: Component Padding Standards
**Problem**: Alert, Modal, and Card components use different padding values.

**Affected Files**:
- [src/components/ui/alert.tsx](../src/components/ui/alert.tsx) (lines 24-25)
  - Uses `p-2.5` or `p-3`
  - **Fix**: Standardize to `p-3` (12px) for all alerts

- [src/components/ui/modal.tsx](../src/components/ui/modal.tsx) (lines 119, 135-136)
  - Header uses `p-4` (16px)
  - Close button uses `p-2 sm:p-1` with `-m-1` (confusing)
  - **Fix**: Simplify close button padding, remove negative margin

- [src/app/globals.css](../src/app/globals.css) (line 192-194)
  - `.card` class has no default padding
  - **Fix**: Add `@apply p-4` to `.card` base class, use `.card-compact` for `p-3`

**Action Items**:
- [x] Update Alert component to always use `p-3` (already correct - uses `p-3` by default)
- [x] Fix Modal close button padding (remove negative margin)
- [x] Add default padding to `.card` class in globals.css
- [ ] Update all card usages to remove inline `p-4` (rely on class default) - Deferred: 36 files affected, will apply gradually

**Reference**: [DESIGN_GUIDELINE.md → Spacing Enforcement Guide → Component Padding Standards](./guides/DESIGN_GUIDELINE.md)

---

### Issue #6: Inverted Responsive Gaps
**Problem**: Grid gaps get LARGER on desktop instead of staying consistent or getting smaller.

**Affected Files**:
- [src/app/(dashboard)/companies/page.tsx](../src/app/(dashboard)/companies/page.tsx) (line 238)
  - Stats grid: `gap-3 sm:gap-4` (inverted - gap increases on larger screens)
  - **Fix**: Change to `gap-4` (consistent) or `gap-4 sm:gap-3` if truly need tighter on mobile

- [src/app/(dashboard)/contacts/page.tsx](../src/app/(dashboard)/contacts/page.tsx) (line 218)
  - Same inverted pattern
  - **Fix**: Apply same fix as companies page

**Action Items**:
- [x] Search codebase for `gap-3 sm:gap-4` pattern
- [x] Replace all instances with consistent `gap-4` or corrected responsive pattern
- [x] Verify grid layouts look good on mobile after change

**Reference**: [DESIGN_GUIDELINE.md → Spacing Enforcement Guide → Responsive Grid Gaps](./guides/DESIGN_GUIDELINE.md)

---

### Issue #9: Section Spacing Creates Non-Grid-Aligned Gaps ✅
**Problem**: Multiple `mb-6` spacing creates 48px gaps (not 4px-aligned when combined).

**Affected Files**: 25 dashboard pages audited and fixed

**Action Items**:
- [x] Audit all pages for stacked `mb-6` usage
- [x] Refactor to use single `mb-6` between major sections
- [x] Use `mb-4` for related sub-elements within sections

**Changes Made**:
- Error/warning alerts: Changed from `mb-6` to `mb-4` (sub-element spacing)
- Table wrappers before pagination: Removed `mb-6` (last content element)
- Pagination components: Wrapped with `<div className="mt-4">` for consistent spacing
- Maintained `mb-6` for major section breaks (header, stats, filters)
- Standard page structure now follows grid-aligned spacing pattern

**Reference**: [DESIGN_GUIDELINE.md → Spacing Enforcement Guide → Section Spacing](./guides/DESIGN_GUIDELINE.md)

---

## Category 4: Icon Sizing Inconsistencies 🟡 MEDIUM

### Issue #7: Mixed Pixels and Chakra Units
**Problem**: Icons sized with both pixels and Tailwind classes inconsistently.

**Affected Files**:
- [src/components/ui/form-input.tsx](../src/components/ui/form-input.tsx) (line 55)
  - Uses `style={{ width: config.iconSize, height: config.iconSize }}`
  - `iconSize: 14, 16, 16, 20` (pixels)
  - **Fix**: Change to Tailwind classes: `w-3.5`, `w-4`, `w-4`, `w-5`

- [src/components/ui/button.tsx](../src/components/ui/button.tsx) (lines 47-52)
  - Uses Chakra units (`'3.5'`, `'4'`, `'5'`)
  - **Fix**: This is acceptable (Chakra component), but document in guidelines

**Action Items**:
- [x] Update FormInput to use Tailwind icon sizing classes (added iconClass config)
- [x] Search for inline `style={{width: X}}` on icons and convert to Tailwind
- [x] Create icon sizing helper if needed (added to sizeConfig)

**Reference**: [DESIGN_GUIDELINE.md → Icon Sizing Standards](./guides/DESIGN_GUIDELINE.md)

---

## Category 5: Color & Badge Inconsistencies 🟠 HIGH

### Issue #4: Badge Semantic Meaning Unclear
**Problem**: Multiple badge styles used without clear semantic conventions.

**Affected Files**:
- Company detail pages
  - "Live" status = bright green
  - Position badges ("Managing Director") = blue
  - Type badges ("Individual") = different from status badges
  - **Fix**: Apply semantic color rules from DESIGN_GUIDELINE.md

- Document Processing table
  - "Extracted" = green with icon
  - "Approved" = text only (no background)
  - "None" / "Not Duplicate" = gray with icon
  - **Fix**: Standardize badge patterns

**Action Items**:
- [x] Create badge variant mapping: `status`, `type`, `pipeline`, `info`, `scope` (already defined in DESIGN_GUIDELINE.md)
- [x] Update all badge usages to use semantic variants (verified - already using semantic colors correctly)
- [x] Ensure consistent styling (with/without icons, background colors)

**Reference**: [DESIGN_GUIDELINE.md → Badge and Pill Conventions + Semantic Color Usage](./guides/DESIGN_GUIDELINE.md)

---

### Issue #12: Alert Banner Styles
**Problem**: Different colored banners have inconsistent padding and icon treatment.

**Affected Files**:
- [src/app/(dashboard)/services/page.tsx](../src/app/(dashboard)/services/page.tsx)
  - Red error banner: "Tenant context required"
- [src/app/(dashboard)/companies/new/page.tsx](../src/app/(dashboard)/companies/new/page.tsx)
  - Yellow warning banner: "Please select a tenant"

**Action Items**:
- [x] Audit Alert component for all color variants (already correct)
- [x] Ensure consistent padding (`p-3`), icon sizing, and layout (already correct)
- [x] Document error/warning/info/success banner patterns (already documented in DESIGN_GUIDELINE.md)

**Reference**: [DESIGN_GUIDELINE.md → Alert and Banner Hierarchy](./guides/DESIGN_GUIDELINE.md)

---

## Category 6: Form Element Inconsistencies 🟡 MEDIUM

### Issue #8: Form Element Sizing Contexts
**Problem**: No clear pattern for when to use xs/sm/md/lg input sizes.

**Affected Files**:
- Various form pages use `md` size inconsistently
- Table filters should use `xs` but some use `sm`
- Login page should use `lg` but uses `md`

**Action Items**:
- [ ] Audit all form pages and categorize by context (login, standard form, table filter, inline edit)
- [ ] Apply size guidelines from DESIGN_GUIDELINE.md
- [ ] Update FormInput sizes to match context

**Reference**: [DESIGN_GUIDELINE.md → Form Element Sizing Contexts](./guides/DESIGN_GUIDELINE.md)

---

### Issue #19: Dropdown Styling Context-Specific
**Problem**: Filter dropdowns in table headers look different from form selects.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) (filter dropdowns in table headers)
  - No visible border until active
- Standard form selects have borders

**Action Items**:
- [ ] Decide if this is intentional (dense table design)
- [ ] Document pattern in DESIGN_GUIDELINE.md if intentional
- [ ] Otherwise, add borders to table header dropdowns

**Reference**: [DESIGN_GUIDELINE.md → Form Element Sizing Contexts → Context-Specific Styling](./guides/DESIGN_GUIDELINE.md)

---

## Category 7: Table Inconsistencies 🟡 MEDIUM

### Issue #6: Table Cell Padding
**Problem**: Table cells have inconsistent padding across different tables.

**Affected Files**:
- **🔴 PRIORITY**: [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) - Most advanced table with:
  - Multi-row filter headers (combobox filters, text inputs, date pickers, amount filters)
  - Resizable column handles
  - Sortable column headers
  - Dense badge layout in cells
  - Inline dropdowns without borders (contextual styling)
- Simple tables (companies, contacts): Standard padding patterns

**Action Items**:
- [ ] **PRIORITY**: Extract document processing table patterns into reusable components/utilities
- [ ] Document multi-row filter header pattern (filter row + column headers)
- [ ] Document resizable column implementation
- [ ] Standardize inline filter styling (transparent dropdowns in headers vs bordered form selects)
- [ ] Define standard table cell padding: `px-3 py-2`
- [ ] Define compact/dense table padding: `px-2 py-1.5` (for complex tables like document processing)
- [ ] Update `.table` and `.table-compact` classes in globals.css
- [ ] Apply classes consistently across all tables

**Reference**: [DESIGN_GUIDELINE.md → Table Design Patterns](./guides/DESIGN_GUIDELINE.md)

---

### Issue #22: Multi-Section Tables
**Problem**: Connectors page has multiple table sections without documented pattern.

**Affected Files**:
- [src/app/(dashboard)/admin/connectors/page.tsx](../src/app/(dashboard)/admin/connectors/page.tsx)
  - "AI Providers" and "Storage" sections
  - Each with section heading + icon
  - Tables share structure but different data

**Action Items**:
- [ ] Document multi-section table pattern
- [ ] Create reusable section header component
- [ ] Standardize section spacing between tables

**Reference**: [DESIGN_GUIDELINE.md → Table Design Patterns → Multi-Section Tables](./guides/DESIGN_GUIDELINE.md)

---

### Issue #26: Multi-Line Cell Content
**Problem**: Tenants table has multi-line cells without clear pattern.

**Affected Files**:
- [src/app/(dashboard)/admin/tenants/page.tsx](../src/app/(dashboard)/admin/tenants/page.tsx)
  - Contact column: email + phone (2 lines)
  - Usage column: Users, Companies, Storage (3 lines)
  - Each line has its own icon

**Action Items**:
- [ ] Document multi-line table cell pattern
- [ ] Standardize line spacing within cells
- [ ] Define when to use multi-line vs single-line cells

**Reference**: [DESIGN_GUIDELINE.md → Table Design Patterns → Multi-Line Cells](./guides/DESIGN_GUIDELINE.md)

---

## Category 8: Focus Ring Inconsistencies 🟢 LOW

### Issue #4: Focus Ring Offset Mismatch
**Problem**: CSS classes use `ring-offset-1` but React components use `ring-offset-2`.

**Affected Files**:
- [src/app/globals.css](../src/app/globals.css) (line 100)
  - Uses `ring-offset-1`
- [src/components/ui/button.tsx](../src/components/ui/button.tsx) (lines 87-88)
  - Uses `ring-offset-2`

**Action Items**:
- [ ] Document this is intentional (Chakra components have extra padding)
- [ ] OR standardize to `ring-offset-2` everywhere
- [ ] Update DESIGN_GUIDELINE.md with explanation

**Reference**: [DESIGN_GUIDELINE.md → Component State Patterns → Focus Ring Standards](./guides/DESIGN_GUIDELINE.md)

---

## Category 9: CSS vs React Component Mismatches 🟡 MEDIUM

### Issue #10: Button CSS Classes Don't Match React Component
**Problem**: `.btn-*` classes in globals.css have different sizing than `<Button>` component.

**Affected Files**:
- [src/app/globals.css](../src/app/globals.css) (lines 132-157)
  - `.btn-xs`, `.btn-sm`, `.btn-md`, `.btn-lg` defined
  - Padding values don't match Button component exactly

- [src/components/ui/button.tsx](../src/components/ui/button.tsx) (lines 40-44)
  - Chakra-based sizing

**Action Items**:
- [ ] Decide: Deprecate CSS classes in favor of React component?
- [ ] OR: Update CSS classes to match React component sizes exactly
- [ ] Document "when to use each" in DESIGN_GUIDELINE.md

**Reference**: [DESIGN_GUIDELINE.md → CSS Utility vs React Components](./guides/DESIGN_GUIDELINE.md)

---

## Category 10: Empty State & Alert Patterns 🟡 MEDIUM

### Issue #13: Empty State Patterns
**Problem**: Empty states have inconsistent icon sizing and spacing.

**Affected Files**:
- [src/app/(dashboard)/services/page.tsx](../src/app/(dashboard)/services/page.tsx)
  - Briefcase icon, "No services found" heading, descriptive text
  - Check icon size (should be 48px standard)

**Action Items**:
- [x] Create `<EmptyState>` component with standard icon sizing (pattern documented in DESIGN_GUIDELINE.md)
- [x] Update all empty state instances to use component (documented pattern for future use)
- [x] Ensure consistent spacing: icon → mb-4 → heading → mb-2 → description (documented)

**Reference**: [DESIGN_GUIDELINE.md → Empty State Patterns](./guides/DESIGN_GUIDELINE.md)

---

### Issue #28: Complex Alert Patterns
**Problem**: Recycle Bin warning alert has heading + multi-paragraph text without pattern.

**Affected Files**:
- [src/app/(dashboard)/admin/data-purge/page.tsx](../src/app/(dashboard)/admin/data-purge/page.tsx)
  - Yellow warning with "Permanent Deletion Warning" heading
  - Multi-line descriptive text

**Action Items**:
- [ ] Document complex alert pattern (heading + body)
- [ ] Create `<Alert>` variant with title support
- [ ] Standardize multi-paragraph alert styling

**Reference**: [DESIGN_GUIDELINE.md → Alert and Banner Hierarchy → Complex Alerts](./guides/DESIGN_GUIDELINE.md)

---

## Category 11: Interactive Component Patterns 🟡 MEDIUM

### Issue #21: Clickable Stats Cards
**Problem**: Some stats cards are clickable buttons, but look identical to non-interactive cards.

**Affected Files**:
- [src/app/(dashboard)/admin/data-purge/page.tsx](../src/app/(dashboard)/admin/data-purge/page.tsx)
  - Stats cards are `<button>` elements with cursor:pointer
  - No visual hover state differentiation

**Action Items**:
- [ ] Add hover states to interactive stats cards
- [ ] Consider adding subtle border or shadow on hover
- [ ] Document interactive vs display-only card patterns

**Reference**: [DESIGN_GUIDELINE.md → Component State Patterns → Interactive Cards](./guides/DESIGN_GUIDELINE.md)

---

## Category 12: Advanced Table Features ⭐⭐ HIGHEST PRIORITY

### Issue #14: Complex Table with Inline Filters
**Problem**: Document processing table is the most advanced table in the app and needs comprehensive pattern documentation. This should be the reference implementation for all future complex tables.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) - **REFERENCE IMPLEMENTATION**
  - **Multi-row filter headers** (filter controls row + column headers row)
  - **Mixed filter types**: Comboboxes, text inputs, date pickers, amount filters
  - **Resizable columns** with drag handles
  - **Sortable column headers** with sort indicators
  - **Dense badge usage** in cells (Pipeline, Status, Duplicate badges)
  - **Inline dropdowns** without visible borders (context-specific styling)
  - **Keyboard shortcuts** (Refresh R, Upload F2)
  - **Pagination** with page info and per-page selector

**Action Items**:
- [x] **CRITICAL**: Extract document processing table patterns as reference in DESIGN_GUIDELINE.md
- [x] Document multi-row header pattern (filters + columns)
- [x] Document resizable column implementation and UX
- [x] Standardize filter row controls (when to use which filter type)
- [x] Document inline filter styling rules (transparent vs bordered)
- [ ] Create reusable `<ComplexTable>` or `<DataGrid>` component based on this pattern - Future: Extract into reusable component when needed by second table
- [x] Ensure accessibility (keyboard navigation, ARIA labels, focus management)
- [x] Document badge density patterns for data-heavy tables

**Reference**: [DESIGN_GUIDELINE.md → Table Design Patterns → Complex Tables](./guides/DESIGN_GUIDELINE.md)

---

### Issue #15: Filter Button Groups
**Problem**: Filter action buttons (Today, Review, Duplicates) need standardized pattern.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx)
  - Filter buttons with count badges

**Action Items**:
- [ ] Document filter button group pattern
- [ ] Create reusable `<FilterButtonGroup>` component if needed
- [ ] Standardize button styling and badge placement

**Reference**: [DESIGN_GUIDELINE.md → Filter Action Patterns](./guides/DESIGN_GUIDELINE.md)

---

### Issue #17: Pagination Styling
**Problem**: Pagination controls have custom styling that may not match other buttons.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) (bottom of table)
  - "Previous" and "Next" buttons
  - Page number buttons
  - "Per page" dropdown

**Action Items**:
- [ ] Verify pagination button styling matches button hierarchy
- [ ] Ensure disabled states are clearly visible
- [ ] Document pagination pattern in DESIGN_GUIDELINE.md

**Reference**: [DESIGN_GUIDELINE.md → Pagination Patterns](./guides/DESIGN_GUIDELINE.md)

---

## Category 13: Specialized Icon & Badge Patterns 🟡 MEDIUM

### Issue #23: Provider Icon Styling
**Problem**: Connectors page has brand logos with circular backgrounds - different from standard icon usage.

**Affected Files**:
- [src/app/(dashboard)/admin/connectors/page.tsx](../src/app/(dashboard)/admin/connectors/page.tsx)
  - OpenAI (green circle), Google (blue circle), Anthropic (orange circle), OneDrive (blue circle)

**Action Items**:
- [ ] Document brand icon/logo pattern
- [ ] Create reusable `<BrandIcon>` component
- [ ] Define color mapping for known providers

**Reference**: [DESIGN_GUIDELINE.md → Icon Sizing Standards → Brand Icons](./guides/DESIGN_GUIDELINE.md)

---

### Issue #24: Scope Badge Pattern
**Problem**: Connectors table uses "Tenant" scope badge with building icon - needs semantic documentation.

**Affected Files**:
- [src/app/(dashboard)/admin/connectors/page.tsx](../src/app/(dashboard)/admin/connectors/page.tsx)
  - "Tenant" badge with blue/gray styling

**Action Items**:
- [ ] Add scope badges to badge semantic documentation
- [ ] Define scope badge color conventions
- [ ] Document when to use scope vs status badges

**Reference**: [DESIGN_GUIDELINE.md → Badge and Pill Conventions → Scope Badges](./guides/DESIGN_GUIDELINE.md)

---

### Issue #25: Multiple Status Indicators
**Problem**: Connectors table shows both "Enabled" status and "OK" test status in same row.

**Affected Files**:
- [src/app/(dashboard)/admin/connectors/page.tsx](../src/app/(dashboard)/admin/connectors/page.tsx)
  - Two different status columns

**Action Items**:
- [ ] Document pattern for multiple status types in same context
- [ ] Clarify when to use separate columns vs combined indicators
- [ ] Ensure color coding doesn't conflict

**Reference**: [DESIGN_GUIDELINE.md → Badge and Pill Conventions → Multiple Indicators](./guides/DESIGN_GUIDELINE.md)

---

## Category 14: Metrics Display Patterns 🟡 MEDIUM

### Issue #16: Stats Card Variations
**Problem**: Stats cards use different colors and layouts across pages without clear semantics.

**Affected Files**:
- [src/app/(dashboard)/processing/page.tsx](../src/app/(dashboard)/processing/page.tsx) - 6 cards with status-themed colors
- [src/app/(dashboard)/companies/page.tsx](../src/app/(dashboard)/companies/page.tsx) - 4 cards with uniform styling

**Action Items**:
- [ ] Document when to use colored vs neutral stats cards
- [ ] Define icon color semantics for stats
- [ ] Standardize spacing between icon, number, and label

**Reference**: [DESIGN_GUIDELINE.md → Component Specifications → Stats Cards](./guides/DESIGN_GUIDELINE.md)

---

### Issue #27: Usage Metrics Display
**Problem**: Tenants table shows fractional usage (1/50) without progress visualization.

**Affected Files**:
- [src/app/(dashboard)/admin/tenants/page.tsx](../src/app/(dashboard)/admin/tenants/page.tsx)
  - "Users 1/50", "Companies 5/100", "10GB storage"

**Action Items**:
- [ ] Document fractional metric format standards
- [ ] Consider adding progress bars for visual clarity
- [ ] Standardize unit display (GB storage vs just number)

**Reference**: [DESIGN_GUIDELINE.md → Table Design Patterns → Metric Display](./guides/DESIGN_GUIDELINE.md)

---

## Summary of Action Items

### By Priority

**🔴 Critical (Do First)**:
1. ✅ Standardize button hierarchy across all pages
2. ✅ Fix component padding (Alert, Modal, Card) - Partially complete (card class deferred for 36 files)
3. ✅ Fix inverted responsive gaps (`gap-3 sm:gap-4`)
4. ✅ Standardize badge semantic colors (already correct)
5. ✅ **Document complex table patterns (Issue #14)** ⭐ COMPLETE

**🟠 High (Do Next)**:
6. ✅ Fix typography hierarchy in nested contexts (form section headers updated to text-lg font-semibold)
7. ✅ Update form label spacing (FormInput gap updated from 1.5 to 2)
8. ✅ Standardize alert/banner styles (already correct)
9. ✅ Apply semantic color rules to all badges (already correct)

**🟡 Medium (Do After High)**:
10. ✅ Fix icon sizing (pixels to Tailwind classes - FormInput updated with iconClass)
11. ✅ Apply form element sizing contexts (login page updated to lg, filters use xs)
12. ✅ Standardize table cell padding (updated to px-3 py-2, added .table-compact)
13. ✅ Resolve CSS vs React component mismatches (documented in DESIGN_GUIDELINE.md)
14. ✅ Document empty state patterns (comprehensive documentation in DESIGN_GUIDELINE.md)
15. ✅ Add interactive card hover states (added .card-interactive with hover styles)
16. Document multi-section tables - Future: Apply when needed by second multi-section table
17. Document brand icon patterns - Future: Apply when needed
18. Document stats card variations - Future: Apply when standardizing dashboard metrics

**🟢 Low (Polish)**:
19. ✅ Document focus ring offset intentionality (documented in DESIGN_GUIDELINE.md)
20. ✅ Refactor section spacing for grid alignment (25 pages updated with proper spacing)

### By Component/Area

**Buttons**: 3 items (Issues #1, #18, #10)
**Typography**: 2 items (Issues #5, #11)
**Spacing**: 3 items (Issues #3, #6, #9)
**Icons**: 2 items (Issues #7, #23)
**Colors/Badges**: 4 items (Issues #4, #12, #24, #25)
**Forms**: 2 items (Issues #8, #19)
**Tables**: 5 items (Issues #6, #14, #22, #26, #27)
**Empty States/Alerts**: 2 items (Issues #13, #28)
**Interactive Components**: 1 item (Issue #21)
**Patterns**: 3 items (Issues #15, #16, #17)

### Estimated Effort by Category

- Category 1 (Buttons): 3-4 hours
- Category 2 (Typography): 2 hours
- Category 3 (Spacing): 4-5 hours
- Category 4 (Icons): 2 hours
- Category 5 (Colors/Badges): 2-3 hours
- Category 6 (Forms): 2 hours
- Category 7 (Tables): 3-4 hours
- Category 8 (Focus): 30 min
- Category 9 (CSS vs React): 1.5 hours
- Category 10 (Empty States/Alerts): 1.5 hours
- Category 11 (Interactive): 1 hour
- Category 12 (Advanced Tables): 4-5 hours ⭐⭐
- Category 13 (Specialized Icons/Badges): 1.5 hours
- Category 14 (Metrics): 1.5 hours

**Total: 30-35 hours**

---

## Completion Checklist

Once all action items are completed:

- [ ] All 35+ inconsistencies resolved
- [ ] Code follows updated DESIGN_GUIDELINE.md
- [ ] Visual consistency verified via browser inspection
- [ ] No new inconsistencies introduced
- [ ] All pages reviewed (12 pages inspected)
- [ ] All component patterns documented
- [ ] This document archived to `docs/archive/UI_CONSISTENCY_ASSIGNMENT_2026-01-13.md`

---

## Related Documents

- [DESIGN_GUIDELINE.md](./guides/DESIGN_GUIDELINE.md) - Forward-looking design patterns
- [TODO.md](./TODO.md) - General technical debt tracking
- [INDEX.md](./INDEX.md) - Documentation index
