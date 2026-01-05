Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time. If you encounter error or any potential improvement unrelated to current implementation, update it TODO.md

Ensure all new pages/ model windows/ design elements are in compliance with the DESIGN_GUIDELINE.md

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase.

----
## EXISTING ISSUES:

### Document Processing - OPTIMIZATION OPPORTUNITIES (Non-blocking)
- [ ] **Async auto-extraction error handling**: Errors only logged to console, not stored in database
- [ ] **N+1 query problem**: Duplicate detection could potentially load thousands of documents (add filters to reduce candidate set)

### Document Processing - REMAINING IMPROVEMENTS
- [ ] Review next button is not ideal, there should be major redesign or a page/ feature that is specifically used for user to approve documents

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

