Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time. If you encounter error or any potential improvement unrelated to current implementation, update it TODO.md

Ensure all new pages/ model windows/ design elements are in compliance with the DESIGN_GUIDELINE.md

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase.

----
## EXISTING ISSUES:

### Document Processing - UX IMPROVEMENTS ✅
- [x] **IMPLEMENTED**: Inline column filters in table headers
  - Replaced expandable filter panel with toolbar + inline column filters
  - Toolbar includes: search, quick filters (Today, Review, Duplicates), company selector, tags, adjust columns
  - Inline filters using SearchableSelect: company, pipeline status, revision status, duplicate status
  - Inline text filters: fileName, vendor, docNumber
  - Inline date range filters using DatePicker: document date, uploaded date
  - No filters for: category, sub-category (not in search params), amount columns (not practical for inline filtering)
  - Mobile: keeps original filter panel approach
  - Desktop: Excel-like filter experience with filters directly below column headers

### Document Processing - OPTIMIZATION OPPORTUNITIES (Non-blocking)
- [ ] **Async auto-extraction error handling**: Errors only logged to console, not stored in database
- [ ] **N+1 query problem**: Duplicate detection could potentially load thousands of documents (add filters to reduce candidate set)

### Document Processing - REMAINING IMPROVEMENTS
- [ ] Review next button is not ideal, there should be major redesign or a page/ feature that is specifically used for user to approve documents
- [ ] Total on the table for amount columns, should be calculated based on the filtered items or selected items
- [ ] Sidebar when minimize, doesn't show the sub menu
- [ ] Implement the pagination (refer to DESIGN_GUIDELINE.md)
- [ ] Make the table value the same font colour
- [ ] Add a column for tags (show in badges) and document currency
- [x] **COMPLETED**: Integrated AmountFilter component for all amount columns in processing table
  - Created reusable AmountFilter component with single value and range modes (exact match or min/max range)
  - Currency-agnostic (works with raw numbers, auto-formats with commas)
  - Keyboard navigation support (Enter to apply, Escape to close globally)
  - Portal-rendered dropdown to avoid table clipping issues
  - Smart positioning: automatically opens to left if no space on right, opens above if no space below
  - Fixed dimensions: modal maintains consistent width when switching between "Exact" and "Range" modes (no UI shifts)
  - Responsive: handles scroll events, window resize, and small viewports gracefully
  - Component: `src/components/ui/amount-filter.tsx`
  - Documentation: See "AmountFilter" section in `docs/DESIGN_GUIDELINE.md` under Filter Components
  - Usage examples: `src/components/ui/amount-filter.example.tsx`
  - Integrated into processing table for all 6 amount columns: subtotal, tax, total, homeSubtotal, homeTax, homeTotal
  - Added URL parameter parsing and serialization (single value mode uses base param, range mode uses From/To suffixes)
  - Updated API route (`src/app/api/processing-documents/route.ts`) to parse amount filter parameters
  - Updated service layer (`src/services/document-processing.service.ts`) to filter by amounts using Prisma Decimal comparisons
  - **Fixed**: handleFiltersChange now properly merges filters instead of replacing (preserves existing filters when adding new ones)
  - Full end-to-end implementation: Frontend → URL params → API → Service → Database
- [x] **COMPLETED**: Add inline filters for category and sub-category with full backend support
  - Added documentCategory and documentSubCategory to ProcessingDocumentSearchParams interface
  - Updated API route to parse category and subcategory parameters
  - Updated service layer to filter by documentCategory and documentSubCategory
  - Added SearchableSelect inline filters for both category and subcategory columns
  - Used CATEGORY_LABELS and SUBCATEGORY_LABELS from @/lib/document-categories


----

## PLANNED FUNCTIONALITY:
- [ ] Deadline management
- [ ] KYCCDD Module
- [ ] URL shortener
- [ ] E-signature
- [ ] Salesrooms

### Documents
- [ ] Mobile friendliness
- [ ] Document generation - save draft to pause
- [ ] Templates-partials/document generation - remove page number
- [ ] Letterhead issues
- [ ] Share button >> format issue, comment issue, notification issue

Column details and filter options, export details, preview next page navigation have to be more obvious, company name consistency, option without line item/ AI extraction.

