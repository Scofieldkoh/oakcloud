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


Column details and filter options, export details, preview next page navigation have to be more obvious, copmpany name consistency, option without line item/ AI extraction.


Header details not viewable before approval, opening multiple tabs for documents, inconvenient of toggle between unapproved documents, each document takes about 2 seconds to load, columns cannot see full value, no quick filters options
