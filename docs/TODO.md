Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time. 

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase. If you encounter error or any potential improvement, raise it up to user.

----
## EXISTING ISSUES:

### System-wide
- [ ] Backup of database
  - **Note**: Configure PostgreSQL automated backups (pg_dump, WAL archiving) or use managed database service


### Connectors
- [ ] Ensure connector for OneDrive is working
  - **Status**: OneDrive connector test function implemented in `connector.service.ts`
  - Uses Microsoft OAuth client credentials flow
  - Requires: `clientId`, `clientSecret`, `tenantId` (Azure AD)

### Document Processing
- 

### Documents
- [ ] Document should be encrypted with 512SHA/AES-512
  - **Note**: Current encryption uses AES-256-GCM (industry standard). AES-512 doesn't exist; consider AES-256 with SHA-512 for key derivation if stronger hashing is needed.
- [ ] Mobile friendliness
- [ ] Document generation - save draft to pause
- [ ] Templates-partials/document generation - remove page number
- [ ] Letterhead issues
- [ ] Share button >> format issue, comment issue, notification issue
- [x] Comment notifications not implemented (`document-comment.service.ts:642`)
  - **Resolved**: Implemented email notifications when external users add comments via shared links
  - Uses `notificationEmail` template and existing email service (Graph API or SMTP)

----

## PLANNED FUNCTIONALITY:
- [ ] Deadline management
- [ ] KYCCDD Module
- [ ] URL shortener
- [ ] E-signature
- [ ] Salesrooms

- checkbox selector consistency
