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

### Infrastructure (Updated 2025-12-19)
- [x] Prisma 7.x Migration
  - **Completed**: Migrated from Prisma 6.19.1 to 7.2.0
  - Uses `@prisma/adapter-pg` driver adapter with connection pooling
  - Generated client at `src/generated/prisma/` (import from `@/generated/prisma`)
  - Configuration via `prisma.config.ts` at project root
  - 302 tests passing with comprehensive Prisma 7 test coverage
- [x] MinIO Object Storage
  - **Completed**: Implemented S3-compatible storage abstraction
  - `StorageKeys` utility for tenant-isolated paths
  - `S3StorageAdapter` with full operation support (upload, download, delete, list, copy, move)
  - Docker Compose includes MinIO container (ports 9000/9001)
  - 42 storage tests passing with 91%+ coverage

### Companies
- [x] Where are uploaded bizfile saved?
  - **Resolved**: BizFile documents are stored in MinIO (S3-compatible object storage):
    - Path: `{tenantId}/pending/{documentId}/original.{ext}`
    - Storage adapter: MinIO/S3 with centralized `StorageKeys` utility
    - Max file size: 10MB (configurable via `MAX_FILE_SIZE` env var)
    - Supported formats: PDF, PNG, JPG, WebP
    - MinIO Console: http://localhost:9001 (oakcloud / oakcloud_minio_secret)

### Connectors
- [ ] Ensure connector for OneDrive is working
  - **Status**: OneDrive connector test function implemented in `connector.service.ts`
  - Uses Microsoft OAuth client credentials flow
  - Requires: `clientId`, `clientSecret`, `tenantId` (Azure AD)

### Document Processing
- [x] Duplicate detection not working for image PDFs
  - **Resolved**: Added post-extraction duplicate check in `document-extraction.service.ts`
  - Problem: Duplicate check only ran at upload time, before OCR/extraction for image PDFs
  - Fix: Added `checkForDuplicates()` call after extraction completes
  - Also updated `duplicate-detection.service.ts` to fall back to latest draft revision when `currentRevisionId` is null
  - Detection layers: 100% (hash), weighted scoring (vendor 25%, doc# 30%, date 20%, amount 25%)

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
