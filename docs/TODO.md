Instruction (Do not remove)
Remember to keep the code clean, efficient, modular and reusable. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time.

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing.

----
## EXISTING ISSUES:

### Roles/Users
- [x] Role permission granularity still has issues
  - **Resolved**: Added `connector` resource to RBAC system. TENANT_ADMIN now has full connector permissions.
  - RBAC system supports: tenant, user, role, company, contact, document, officer, shareholder, audit_log, connector

### System-wide
- [ ] Backup of database
  - **Note**: Configure PostgreSQL automated backups (pg_dump, WAL archiving) or use managed database service
- [x] Look out for const that should be centrally managed for good practises
  - **Resolved**: Comment constants (MAX_COMMENT_LENGTH, DEFAULT_COMMENT_RATE_LIMIT, COMMENT_RATE_LIMIT_WINDOW_MS) moved to `src/lib/constants/application.ts`

### Companies
- [x] Where are uploaded bizfile saved?
  - **Resolved**: BizFile documents are stored locally at:
    - Path: `{UPLOAD_DIR}/pending/{tenantId}/{fileId}.{ext}` (default: `./uploads/pending/...`)
    - Configure via `UPLOAD_DIR` environment variable
    - Max file size: 10MB (configurable via `MAX_FILE_SIZE` env var)
    - Supported formats: PDF, PNG, JPG, WebP

### Connectors
- [ ] Ensure connector for OneDrive is working
  - **Status**: OneDrive connector test function implemented in `connector.service.ts`
  - Uses Microsoft OAuth client credentials flow
  - Requires: `clientId`, `clientSecret`, `tenantId` (Azure AD)

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
- arhive and delete options/ data purge
- all extracted data should have bounding box, and the indicator for AI extraction confidence