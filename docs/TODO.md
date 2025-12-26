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


- Selection of tenant preference for exchange rate sync/ usage?

- Error on scheduled task:
[2025-12-26T10:15:00.030Z] ERROR [backup-task] Failed to process scheduled backups: TypeError: Cannot read properties of undefined (reading 'processScheduledBackups')
    at Object.executeBackupTask [as execute] (src\lib\scheduler\tasks\backup.task.ts:50:40)
    at async TaskScheduler.executeTask (src\lib\scheduler\scheduler.ts:147:22)
    at async (src\lib\scheduler\scheduler.ts:116:9)
  48 |   try {
  49 |     const backupService = await getBackupService();
> 50 |     const result = await backupService.processScheduledBackups();
     |                                        ^
  51 |
  52 |     if (result.processed === 0) {
  53 |       return {
[2025-12-26T10:15:00.037Z] WARN [scheduler] Task "Scheduled Backups" failed in 8ms: Cannot read properties of undefined (reading 'processScheduledBackups')