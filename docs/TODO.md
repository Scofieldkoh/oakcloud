Instruction (Do not remove)
This web app is in development and testing stage, all data are dummy, and it's ok to refactor and redesign, no backward compatibility required. Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (under docs) instead of creating new documentation every time.

Ensure all new pages or model windows are in compliance with the DESIGN_GUIDELINE.md

You can read the MD files of the docs for information; they are documented and contain the latest information on the codebase. If you encounter error or any potential improvement, raise it up to user.

----
## EXISTING ISSUES:

### System-wide
- [x] Backup of database and files
  - **Status**: Fully implemented with cleanup and scheduling support
  - **Location**: `/admin/backup` (Super Admin only)
  - **Features**:
    - Create backups, restore from backups, download, delete
    - Automatic cleanup of expired backups
    - Scheduled backup support (per-tenant configuration)
    - Stale backup detection and marking
  - **Storage**: Backups stored in S3/MinIO under `backups/{backupId}/` prefix
  - **Retention policy**: Set retention days when creating backup, auto-deletes when expired
  - **API Endpoints**:
    - `POST /api/admin/backup/cleanup` - Clean up expired/stale backups
    - `POST /api/admin/backup/scheduled` - Process due scheduled backups
  - **Environment Variables** (`.env`):
    - `CRON_SECRET` - For cron job authentication
    - `BACKUP_CLEANUP_ENABLED` - Enable cleanup via cron (default: false)
    - `BACKUP_SCHEDULE_ENABLED` - Enable scheduled backups via cron (default: false)
    - `BACKUP_STALE_THRESHOLD_MINUTES` - Stale detection threshold (default: 60)
    - `BACKUP_DEFAULT_RETENTION_DAYS` - Default retention (default: 30)
    - `BACKUP_DEFAULT_MAX_BACKUPS` - Max scheduled backups per tenant (default: 10)
    - `BACKUP_DEFAULT_CRON` - Default cron pattern (default: "0 2 * * *")
  - **Not yet implemented**:
    - Scheduled backup UI (schedules can be managed via service API)


### Connectors
- [ ] Ensure connector for OneDrive is working
  - **Status**: OneDrive connector test function implemented in `connector.service.ts`
  - Uses Microsoft OAuth client credentials flow
  - Requires: `clientId`, `clientSecret`, `tenantId` (Azure AD)

### Document Processing
- 

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

- checkbox selector consistency
