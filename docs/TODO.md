Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time. If you encounter error or any potential improvement unrelated to currency implementation, update it TODO.md

Ensure all new pages or model windows are in compliance with the DESIGN_GUIDELINE.md

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase.

----
## RECENTLY COMPLETED:

### Document Processing (Dec 2024)
- [x] Implemented comprehensive document category/sub-category system
  - 11 main categories: ACCOUNTS_PAYABLE, ACCOUNTS_RECEIVABLE, TREASURY, TAX_COMPLIANCE, PAYROLL, CORPORATE_SECRETARIAL, CONTRACTS, FINANCIAL_REPORTS, INSURANCE, CORRESPONDENCE, OTHER
  - 43 sub-categories (e.g., VENDOR_INVOICE, BANK_STATEMENT, BIZFILE, etc.)
  - Category mapping utility at `src/lib/document-categories.ts`
  - Updated AI extraction prompts to detect both category and sub-category

----
## EXISTING ISSUES:

### Document Processing
- [ ] Add sub-category dropdown to document editing UI

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

