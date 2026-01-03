Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time. If you encounter error or any potential improvement unrelated to currency implementation, update it TODO.md

Ensure all new pages or model windows are in compliance with the DESIGN_GUIDELINE.md

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase.

----
## EXISTING ISSUES:

### Document Processing
- [x] Vendor name consistency: canonicalize extracted vendor name via `VendorAlias` + fuzzy matching, and learn aliases on approval
- [x] Customer name consistency: canonicalize extracted customer name via `CustomerAlias` + fuzzy matching, and learn aliases on approval
- [x] Add UI controls for alias learning: "Save as alias" + "Don't learn this correction"
- [x] Improve extraction schema: add explicit `customerName` field (avoid overloading `vendorName` for AR documents)

### Documents
- [ ] Mobile friendliness
- [ ] Document generation - save draft to pause
- [ ] Templates-partials/document generation - remove page number
- [ ] Letterhead issues
- [ ] Share button >> format issue, comment issue, notification issue


----

## PLANNED FUNCTIONALITY:
- [ ] Deadline management
- [ ] KYCCDD Module
- [ ] URL shortener
- [ ] E-signature
- [ ] Salesrooms


### Document Processing UX
- [x] Show extracted data in the processing list immediately after upload (no approval required)
- [x] Allow opening multiple document tabs (Ctrl/Cmd+click, middle-click, context menu)
- [x] Add “Review Next” + prev/next navigation for docs needing review (includes `SUSPECTED` + `WARNINGS/INVALID`)
- [x] Improve detail page load time by removing redundant fetches and disabling auto-revalidate on mount
- [x] Add manual `Revalidate` button during edit
- [x] Auto-fit columns (no truncation), resizable widths, persisted per user across sessions
- [x] Column visibility controls (persisted per user across sessions)
- [x] Add quick filter buttons (icon-only) for common combinations (e.g. uploaded today) using tenant timezone
- [ ] Decide Prisma schema sync strategy for new `user_preferences` table (repo has no migrations; `prisma migrate dev` may detect drift)

Column details and filter options, export details, preview next page navigation have to be more obvious, company name consistency, option without line item/ AI extraction.
