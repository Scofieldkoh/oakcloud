Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time.

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing.

----
## EXISTING ISSUES:

### Roles/Users
- [ ] Role permission granularity still has issues

### System-wide
- [ ] Backup of database
- [ ] Look out for const that should be centrally managed for good practises

### Companies
- [ ] Where are uploaded bizfile saved?

### Connectors
- [ ] Ensure connector for OneDrive is working

### Documents
- [ ] Document should be encrypted with 512SHA/AES-512
- [ ] Mobile friendliness
- [ ] Document generation - save draft to pause
- [ ] Templates-partials/document generation - remove page number
- [ ] Letterhead issues
- [ ] Share button >> format issue, comment issue, notification issue
- [ ] Comment notifications not implemented (`document-comment.service.ts:642`)

----

## PLANNED FUNCTIONALITY:
- [ ] Deadline management
- [ ] KYCCDD Module
- [ ] URL shortener
- [ ] E-signature
- [ ] Salesrooms
