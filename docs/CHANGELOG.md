# Changelog

All notable changes to Oakcloud are documented in this file.

---

## v0.7.0 (2025-12-04)

### Multi-Provider AI Service with Vision Support
- **Reusable AI Service**: Unified AI service supporting multiple providers
  - OpenAI (GPT-5, GPT-4.1)
  - Anthropic (Claude Opus 4.5, Claude Sonnet 4.5)
  - Google (Gemini 3, Gemini 2.5 Flash)
- **AI Vision Capabilities**: All providers now support vision/image input
  - Send PDF and image files directly to AI for analysis
  - Higher accuracy extraction compared to text-based parsing
  - Supports PDF, PNG, JPG, and WebP file formats
- **AI Model Selector Component**: Reusable `<AIModelSelector>` component
  - Groups models by provider with availability status
  - Supports JSON-mode filtering
  - Auto-selects best available model
  - **New**: Optional context input field for additional AI instructions
    - `showContextInput` prop to enable textarea
    - `contextValue` and `onContextChange` for controlled input
    - Character limit with counter display
  - **New**: Standard context injection via checkboxes
    - `showStandardContexts` prop to show quick-select options
    - Built-in options: Current Date & Time, Current Date, Timezone Info
    - Customizable via `standardContextOptions` prop
    - `buildFullContext()` helper function to combine standard + custom context
- **Configurable Default Model**: `DEFAULT_AI_MODEL` environment variable
  - Configure preferred model via environment
  - Falls back to first available model if default unavailable
- **BizFile Extraction Improvements**:
  - **Vision-based extraction**: Documents sent as images for better accuracy
  - **Image file support**: Upload PNG, JPG, WebP in addition to PDF
  - **Additional context**: Users can provide hints to improve extraction
  - Model selection in upload UI
  - Shows AI metadata (model used, token usage) after extraction
- **New API Endpoint**: `GET /api/ai/models` - Returns available models and provider status
- **Dependencies Added**: `@anthropic-ai/sdk`, `@google/generative-ai`
- **Environment Variables**: `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `DEFAULT_AI_MODEL`
- **Database Change**: `Document.companyId` now optional (supports pending documents)

### File Structure
```
src/lib/ai/
├── index.ts           # Main AI service entry point
├── types.ts           # TypeScript types (includes AIImageInput)
├── models.ts          # Model registry and configuration
└── providers/
    ├── openai.ts      # OpenAI provider (vision support)
    ├── anthropic.ts   # Anthropic provider (vision + PDF support)
    └── google.ts      # Google provider (vision support)
```

### API Changes
- `POST /api/documents/:id/extract` now accepts `additionalContext` in request body
- `POST /api/documents/upload` now accepts image files (PNG, JPG, WebP)

---

## v0.6.5 (2025-12-04)
- Latest stable release

## v0.6.4 (2025-12-03)
- Bug fixes and improvements

## v0.6.3 (2025-12-03)
- **Deprecated `User.companyId`**: Removed legacy single-company field from User model
  - Company access now exclusively derived from `UserRoleAssignment.companyId`
  - Session's `companyIds` array populated from all role assignments
  - Removed `companyId` from JWT payload, SessionUser interface, and API responses
  - `canAccessCompany()` now checks against `companyIds` array
- **Per-Company Permission Checks**: Edit/delete buttons now respect company-specific roles
  - Added `useCompanyPermissions(companyIds)` hook for batch permission checks
  - `CompanyTable` accepts permission check functions instead of global booleans
  - Company detail and edit pages pass company ID to `usePermissions(companyId)`
  - Users with different roles per company see appropriate actions for each
- **Filtered Role Assignments Display**: Users page filters now affect displayed assignments
  - Role/company filters show only matching assignments in the table
  - "(X others hidden)" indicator when some assignments are filtered out
  - Clicking still opens full "Manage Roles & Companies" modal

## v0.6.1 (2025-12-03)
- **Email Notifications System**: Complete transactional email support via SMTP
  - New email service (`src/lib/email.ts`) with Nodemailer integration
  - Connection pooling for better performance
  - Automatic fallback to console logging in development mode
  - SMTP configuration via environment variables
- **Email Templates** (`src/lib/email-templates.ts`):
  - Professional, responsive HTML email templates
  - Consistent Oakcloud branding across all emails
  - Support for light/dark email client rendering
- **Supported Email Types**:
  - **Password Reset**: Secure reset link with 24-hour expiry
  - **Password Changed**: Security confirmation notification
  - **User Invitation**: Temporary password and login instructions
  - **Tenant Setup Complete**: Admin welcome email with credentials
  - **User Removed**: Access removal notification
- **Service Integration**:
  - `password.service.ts`: Sends password reset and change confirmation emails
  - `tenant.service.ts`: Sends user invitation, tenant setup, and removal emails
- **Dependencies Added**: `nodemailer@6.x`, `@types/nodemailer`
- **Environment Variables**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`
- **Permission-Based Button Visibility**: UI buttons now hide based on user permissions
  - New API endpoint: `GET /api/auth/permissions` - Returns user's effective permissions
  - New hook: `usePermissions()` - Client-side permission checking with convenience helpers
  - Companies page: "Add Company" and "Upload BizFile" buttons hidden if user lacks permission
  - Company detail page: "Edit" and "Delete" buttons hidden based on `company:update` and `company:delete` permissions
  - Company table: Edit/Delete dropdown items conditionally shown
  - Edit company page: Shows "Access Denied" if user lacks `company:update` permission
  - New company page: Shows "Access Denied" if user lacks `company:create` permission
  - `CompanyTable` component accepts `canEdit`, `canDelete`, `canCreate` props for permission-based rendering

## v0.6.0 (2025-12-03)
- **RBAC Refactoring**: Migrated from hybrid role system to **pure role assignments**
  - **Removed `User.role` field** - All permissions now exclusively via `UserRoleAssignment`
  - **Removed `UserRole` enum** - No more SUPER_ADMIN, TENANT_ADMIN, COMPANY_ADMIN, COMPANY_USER enum values
  - Roles identified by `systemRoleType` field: `SUPER_ADMIN`, `TENANT_ADMIN`, or `null` for custom roles
  - Session computes `isSuperAdmin` and `isTenantAdmin` flags from role assignments (authoritative source)
  - All permission checks use computed session flags
- **Schema Changes**:
  - Removed `role` field from User model
  - Removed `UserRole` enum
  - Added `systemRoleType` field to Role model (indexed for performance)
  - Made `tenantId` nullable on Role model for global roles (SUPER_ADMIN)
  - Made `roleAssignments` required when inviting users (at least one assignment required)
- **Auth Layer Updates** (`src/lib/auth.ts`):
  - `SessionUser` interface: `isSuperAdmin`, `isTenantAdmin` flags, and `companyIds` array (no `role`)
  - `getSession()` fetches role assignments and computes flags from `systemRoleType`
  - `companyIds` computed from all role assignments with non-null `companyId`
  - `canAccessCompany()` uses `companyIds` array for multi-company access checks
  - Removed `requireRole()` function - use `requireAuth()` + flag checks instead
- **RBAC Layer Updates** (`src/lib/rbac.ts`):
  - `hasPermission()` checks `systemRoleType` from role assignments
  - `requirePermission()` and `requireAnyPermission()` use `session.isSuperAdmin/isTenantAdmin`
  - `getUserPermissions()` respects role assignment hierarchy
- **Bug Fixes**:
  - Fixed SUPER_ADMIN "User not found in tenant" error when assigning company to user
  - Fixed TENANT_ADMIN unable to see users/roles by using computed session flags
- **Service Layer Updates**:
  - `tenant.service.ts`: Removed `updateUserRole()`, user creation no longer sets `role`
  - `user-company.service.ts`: Fixed tenant context bug for SUPER_ADMIN operations
  - `role.service.ts`: Updated to allow nullable tenantId for global roles
- **API Updates**:
  - `/api/auth/me`: Returns `isSuperAdmin` and `isTenantAdmin` (no `role`)
  - `/api/tenants/:id/users`: Returns `roleAssignments` and `companyAssignments` (no `role`)
  - All user responses no longer include deprecated `role` field
- **UI Updates**:
  - Combined "Role" and "Companies" columns into single "Roles & Companies" column in users table
  - Renamed "Manage Companies" modal to "Manage Roles & Companies"
  - Add company now requires role selection - creates both company access and role assignment
  - Added ability to remove role assignments from the "Manage Roles & Companies" modal
  - Simplified invite user modal - removed redundant "Company Access" section
  - Added "Make Tenant Admin" checkbox for SUPER_ADMIN (hides role picker when checked)
  - System roles (TENANT_ADMIN, SUPER_ADMIN) filtered out from role dropdowns
  - Updated `Role` interface with `systemRoleType` field
  - Removed deprecated `role` field from `TenantUser` and `RoleUser` interfaces
- **Bug Fixes**:
  - Fixed: Company Admin assigned to company couldn't see that company after login
  - Role assignments with company scope now automatically create UserCompanyAssignment
  - Fixed: SUPER_ADMIN "Company not found in tenant" error when adding company access (now passes tenantId)
  - Fixed: 403 Forbidden for Company Admin on Companies page - permission check now considers all role assignments (not just tenant-wide)
  - Fixed: "User already assigned to this company" error when re-adding role - now allows adding new roles to existing company assignments
- **New Hooks**:
  - `useRemoveUserRoleAssignment(tenantId)` - Remove role assignment from user management context

## v0.5.9 (2025-12-02)
- **Company-Specific Role Assignments**: Granular permission control per company
  - Assign different roles to users for different companies
  - "All Companies" role as default fallback
  - Company-specific roles override tenant-wide roles (specificity priority)
  - Example: User can be Data Viewer for most companies but Auditor for Company B
- **Simplified Permission Model**: Removed `accessLevel` from company assignments
  - Company assignments now only track which companies a user can access
  - All permissions controlled through RBAC role assignments
  - Cleaner separation of concerns: access scope vs. permissions
- **Enhanced Users Page**:
  - Role Assignments section in invite form for company-specific roles
  - Support for "All Companies" or specific company role assignment
  - Updated Manage Companies modal (simplified without access levels)
- **Updated RBAC Utilities**:
  - `hasPermission()` now uses specificity-based role resolution
  - `getUserPermissions()` respects company-specific roles
  - TENANT_ADMIN automatically has all permissions (no explicit assignment needed)
- **Database Schema Change**: Removed `CompanyAccessLevel` enum and `accessLevel` column from `UserCompanyAssignment`

## v0.5.8 (2025-12-02)
- **Enhanced Users Page**: Complete user management functionality
  - **Dynamic Role Selection**: Roles fetched from tenant API (includes custom roles)
    - No more hardcoded roles - shows all system and custom roles for the tenant
    - Role descriptions displayed for clarity
  - **Multi-Company Assignment on Invite**: Assign users to multiple companies during invitation
    - Select multiple companies with checkboxes
    - Set access level per company (View, Edit, Manage)
    - Designate primary company
  - **Edit User Modal**: Comprehensive user editing
    - Update first name, last name, email
    - Change user role (with protection against demoting last tenant admin)
    - Toggle active/inactive status
  - **Send Password Reset**: One-click password reset emails
    - Available from actions dropdown and edit modal
    - Confirmation dialog before sending
  - **Remove User**: Soft delete with reason tracking
    - Confirmation dialog with reason input
    - Protection against removing last tenant admin or self
    - Full audit trail of removal
  - **Actions Dropdown**: Per-row actions menu
    - Edit User, Send Password Reset, Remove User
    - Uses existing Dropdown component for consistency
- **New API Endpoint**: `GET/PATCH/DELETE /api/tenants/:id/users/:userId`
  - GET: Retrieve user details including company assignments and role assignments
  - PATCH: Update user fields, change role, trigger password reset
  - DELETE: Soft delete user with reason
- **New Hooks** (in `use-admin.ts`):
  - `useUpdateUser()` - Update user details
  - `useDeleteUser()` - Remove user from tenant
  - `useSendPasswordReset()` - Trigger password reset email
- **Updated Validation Schema**: `inviteUserSchema` now supports `companyAssignments` array
- **Updated Tenant Service**: `inviteUserToTenant()` handles multi-company assignments

## v0.5.7 (2025-12-02)
- **SUPER_ADMIN Tenant Selector for Roles**: Enhanced roles management for system administrators
  - SUPER_ADMIN users now see a tenant selector dropdown on the Roles & Permissions page
  - Select any tenant to view and manage its roles
  - "Create Role" button disabled until a tenant is selected
  - Clear UI guidance when no tenant is selected
  - Maintains consistency with Users page tenant selector pattern

## v0.5.6 (2025-12-02)
- **RBAC Permission Enforcement**: All API routes now enforce fine-grained permissions
  - `requirePermission()` used across all protected routes
  - Permission checks: `user:read`, `user:create`, `role:read`, `role:create`, `role:update`, `role:delete`, `audit_log:read`
  - Users must have role assignments with appropriate permissions to access routes
  - SUPER_ADMIN bypasses all permission checks
- **Default Custom Roles**: 5 ready-to-use custom roles seeded automatically
  - **Auditor** (7 permissions): Read-only access to audit logs, companies, and documents
  - **Data Entry Clerk** (15 permissions): Create and update data, no delete or export
  - **Report Viewer** (12 permissions): Read and export data for reporting
  - **Document Manager** (10 permissions): Full document management, read-only company access
  - **Manager** (27 permissions): Full company data access, no user/role management
- **Database Seed Enhancements**:
  - 63 permissions auto-seeded (9 resources x 7 actions)
  - 3 system roles with pre-assigned permissions
  - 5 default custom roles for common use cases
  - Idempotent seeding - safe to run multiple times

## v0.5.5 (2025-12-02)
- **Full Roles Management**: Complete CRUD for custom roles
  - **Create Roles**: Create custom roles with selected permissions
  - **Edit Roles**: Update name, description, and permissions for custom roles
  - **Delete Roles**: Remove unused custom roles (blocked if users assigned)
  - **Duplicate Roles**: Copy existing roles as starting point for new roles
  - **Permission Selector**: Interactive UI to select permissions by resource
    - Toggle individual permissions or entire resource groups
    - "Select All" / "Clear All" quick actions
    - Shows selected count per resource
  - System roles (Tenant Admin, Company Admin, Company User) protected from modification
- **Role User Management**: View and manage users assigned to each role
  - See all users with a specific role
  - Assign roles to users (with optional company scope)
  - Remove roles from users
- **New Service**: `role.service.ts` - Business logic for role management
- **New API Endpoints**:
  - `POST /api/tenants/:id/roles` - Create role
  - `GET /api/tenants/:id/roles/:roleId` - Get role details
  - `PATCH /api/tenants/:id/roles/:roleId` - Update role
  - `DELETE /api/tenants/:id/roles/:roleId` - Delete role
  - `POST /api/tenants/:id/roles/:roleId/duplicate` - Duplicate role
  - `GET /api/tenants/:id/roles/:roleId/users` - List role users
  - `POST /api/tenants/:id/roles/:roleId/users` - Assign role to user
  - `DELETE /api/tenants/:id/roles/:roleId/users` - Remove role from user
  - `GET /api/permissions` - List all available permissions
- **New Hooks** (in `use-admin.ts`):
  - `usePermissions()` - Fetch available permissions
  - `useCreateRole()` - Create a new role
  - `useUpdateRole()` - Update an existing role
  - `useDeleteRole()` - Delete a role
  - `useDuplicateRole()` - Duplicate a role
  - `useRoleUsers()` - Get users assigned to a role
  - `useAssignRoleToUser()` - Assign role to user
  - `useRemoveRoleFromUser()` - Remove role from user
- **UI Enhancements**:
  - Roles page completely redesigned with expandable role cards
  - Permission badges grouped by resource for clarity
  - Actions dropdown (edit, delete, duplicate) per role
  - User count displayed on each role card
  - Permission legend explaining each action type

## v0.5.4 (2025-12-02)
- **Enhanced Audit Logging**: More informative audit logs with human-readable summaries
  - New `summary` field: Human-readable description of each action (e.g., "Deleted tenant 'Acme Corp' (cascade: 5 users, 3 companies, 10 contacts)")
  - New `entityName` field: Name of the affected entity for quick identification
  - All specialized audit functions now generate contextual summaries:
    - `logCreate()`, `logUpdate()`, `logDelete()`, `logRestore()` - CRUD operations
    - `logAuthEvent()` - Login/logout events with user email
    - `logDocumentOperation()` - Upload/download with document names
    - `logTenantOperation()` - Tenant lifecycle with cascade counts
    - `logUserMembership()` - User invites/removals with user names and roles
    - `logRoleChange()` - Role changes showing old -> new role
  - Audit logs page UI updated:
    - Description column shows summary prominently instead of entity type
    - Reason preview shown in collapsed row state
    - Expanded view shows changes, metadata details, and context info
  - Data purge/restore actions now include detailed summaries with record names
- **Authentication Audit Logging**: Complete tracking of all auth events
  - Login route now logs:
    - Successful logins with user name, email, role, and tenant info
    - Failed logins with reason (user not found, inactive, wrong password)
    - Tenant status blocks (suspended, deactivated, pending setup)
  - Logout route now logs user logout with session details
  - Password service audit logs updated with `summary` and `entityName`:
    - Password reset requested
    - Password reset completed
    - Password changed
    - Password change required/cleared

## v0.5.3 (2025-12-02)
- **Data Purge Console**: Admin tool for managing soft-deleted records
  - New page at `/admin/data-purge` (SUPER_ADMIN only)
  - Supports permanent deletion of: tenants, users, companies, contacts
  - **Restore functionality**: Recover soft-deleted records before permanent purge
  - **Cascade restore for tenants**: Restoring a tenant also restores all its users, companies, contacts
  - Shows counts and details of all soft-deleted records with deletion reason
  - Multi-select with batch deletion/restore support
  - Confirmation dialog with required reason for purge (min 10 chars)
  - Cascade delete for tenants (removes all related data)
  - All purge/restore actions logged in audit trail
  - API: `GET/POST/PATCH /api/admin/purge`
- **Tenant deletedReason field**: Track why tenants were deleted
  - New `deletedReason` column in Tenant model
  - Displayed in Data Purge page
- **Tenant Soft Delete with Cascade**: Soft-delete tenants and all associated data
  - Tenant must be SUSPENDED or PENDING_SETUP before it can be deleted
  - Cascade soft-deletes all users, companies, and contacts belonging to the tenant
  - "Delete" option added to tenant dropdown menu (visible for SUSPENDED and PENDING_SETUP tenants)
  - Confirmation dialog with required reason
  - Audit log includes cascade counts (users, companies, contacts deleted)
- **New Hooks**:
  - `usePurgeData()` - fetch soft-deleted records
  - `usePurgeRecords()` - permanently delete records
- **Sidebar**: Added "Data Purge" link under Administration (SUPER_ADMIN)

## v0.5.2 (2025-12-02)
- **Tenant Schema Simplified**: Removed address fields from tenant model
  - Removed: `addressLine1`, `addressLine2`, `city`, `postalCode`, `country`
  - Updated tenant setup wizard to reflect changes
  - Database migration applied
- **Tenant Limits**: Enforcement status
  - `maxUsers`: Enforced when inviting users
  - `maxCompanies`: Enforced when creating companies
  - `maxStorageMb`: Helper exists, not yet enforced on upload
- **UI Improvements**:
  - Stepper component now horizontally centered with improved label alignment
  - Modal component supports new `2xl` size option
  - Tenant table: Added "Contact" column with email and phone
  - Tenant edit modal: Added Contact Phone and Storage Limit fields
- **Security Fixes**:
  - Login now blocks users from suspended/deactivated/pending tenants
  - Fixed `mustChangePassword` redirect being bypassed on login page

## v0.5.1 (2025-12-02)
- **Tenant Setup Wizard**: Guided onboarding flow for new tenants
  - 4-step wizard: Tenant Info -> Create Admin -> Create Company (optional) -> Activate
  - Auto-opens after tenant creation in Admin > Tenants page
  - "Complete Setup" action for existing `PENDING_SETUP` tenants
  - Creates first TENANT_ADMIN user with temporary password
  - Optional first company creation during setup
  - Automatic tenant activation on completion
  - API: `POST /api/tenants/:id/setup`
- **New UI Components**:
  - `Stepper` component for multi-step flows (`src/components/ui/stepper.tsx`)
  - `TenantSetupWizard` modal (`src/components/admin/tenant-setup-wizard.tsx`)
  - Step components in `src/components/admin/wizard-steps/`
- **Bug Fixes**:
  - Fixed `/change-password` page missing Suspense boundary for `useSearchParams()`

## v0.5.0 (2025-12-02)
- **Password Reset Flow**: Complete password recovery system
  - Forgot password page (`/forgot-password`) - request reset link
  - Reset password page (`/reset-password?token=xxx`) - set new password
  - Change password page (`/change-password`) - update current password
  - Secure token-based reset (SHA-256 hashed, 24-hour expiry)
  - Password validation: 8+ chars, uppercase, lowercase, number required
- **Force Password Change**: Security enforcement for new users
  - New users must change password on first login
  - `mustChangePassword` flag in User model
  - Automatic redirect to change password page after login
  - Audit logging for all password-related events
- **Multi-Company User Assignment**: Flexible user-company relationships
  - New `UserCompanyAssignment` model with access levels (VIEW, EDIT, MANAGE)
  - Users can now access multiple companies with different permissions
  - Primary company designation for default context
  - "Manage Companies" modal in Admin > Users page
  - API: `GET/POST/PATCH/DELETE /api/users/:id/companies`
- **SUPER_ADMIN User Management**: Enhanced admin capabilities
  - Tenant selector on Users page for SUPER_ADMIN
  - SUPER_ADMIN can manage users across any tenant
  - Clear UI guidance when no tenant is selected
- **Bug Fixes**:
  - Fixed Modal focus stealing on re-render (input fields losing focus)
  - Added missing Edit Tenant modal
  - Added tenantId to JWT token for proper tenant context
- **Services Added**:
  - `password.service.ts` - Password reset, change, and validation
  - `user-company.service.ts` - Multi-company assignment management

## v0.4.2 (2025-12-02)
- **UI Fixes**: Light mode compatibility and dropdown improvements
  - Fixed FormInput label, icon, and hint text colors for light mode visibility
  - Dropdown menu now uses portal rendering to prevent clipping in table containers
  - Dropdown auto-positions (flips above trigger if insufficient space below)
  - Alert dismiss button hover state adapts to light/dark mode

## v0.4.1 (2025-12-02)
- **Security Fixes**: Critical tenant isolation improvements
  - Fixed `canAccessTenant()` and `canManageTenant()` to properly validate tenant membership
  - Added tenant validation to company GET/PATCH/DELETE/PUT routes
  - Contact `linkContactToCompany()` now validates both entities belong to same tenant
  - Company stats route now returns tenant-scoped stats for TENANT_ADMIN
- **Bug Fixes**:
  - Fixed company search for COMPANY_ADMIN/USER to return only their assigned company
  - Fixed pagination response format in frontend hooks to match API structure
  - Fixed secondary/ghost button colors for light mode compatibility
- **Code Quality**:
  - Added tenant validation to `unlinkContactFromCompany()` and `getContactsByCompany()`
  - Standardized tenant where clause pattern across company routes

## v0.4.0 (2025-12-02)
- **Admin Dashboard UI**: Complete admin interface for multi-tenancy management
  - User Management page (`/admin/users`) - invite, view, and manage users
  - Audit Logs Dashboard (`/admin/audit-logs`) - view all system activity with filters
  - Tenant Management page (`/admin/tenants`) - SUPER_ADMIN tenant CRUD
  - Roles & Permissions page (`/admin/roles`) - view roles and permissions
- **Sidebar Admin Section**: Dynamic admin navigation based on user role
  - SUPER_ADMIN sees: Tenants, Users, Roles, Audit Logs
  - TENANT_ADMIN sees: Users, Roles, Audit Logs
- **Fine-Grained RBAC Integration**: API routes now use permission-based checks
  - Replaced `requireRole()` with `requirePermission()` in company routes
  - COMPANY_ADMIN can now update their assigned company (previously SUPER_ADMIN only)
  - All permission checks use the RBAC system with `resource:action` format
- **Tenant-Aware Service Layer**: All services now enforce tenant isolation
  - `contact.service.ts` - all operations scoped to tenant
  - `bizfile.service.ts` - contact creation includes tenant context
  - `TenantAwareParams` pattern: `{ tenantId, userId }` for create/update operations
  - Search and get operations accept optional `tenantId` for filtering
- **New Hooks**:
  - `use-admin.ts` - hooks for users, tenants, roles, and audit logs

## v0.3.0 (2025-12-01)
- **RBAC (Role-Based Access Control)**: Fine-grained permission system
  - New Role, Permission, RolePermission, UserRoleAssignment models
  - Permission format: `resource:action` (e.g., `company:update`)
  - System roles auto-created for new tenants (Tenant Admin, Company Admin, Company User)
  - Company-scoped role assignments
  - Permission checking utilities (`hasPermission`, `requirePermission`)
  - Custom role creation support
- **Removed Plan/Billing**: Simplified tenant model
  - Removed TenantPlan enum and plan field
  - Increased default limits (50 users, 100 companies, 10GB storage)
  - Permissions now managed via RBAC instead of plan tiers
- **Integration**:
  - User invitations automatically assign RBAC roles
  - System roles initialized on tenant creation
  - RBAC utilities in `src/lib/rbac.ts`

## v0.2.0 (2025-12-01)
- **Multi-Tenancy**: Full tenant isolation with configurable limits
  - New Tenant model with status and limits
  - TenantId added to Company, Contact, Document, AuditLog
  - TENANT_ADMIN role for tenant-level management
  - Tenant-scoped queries with automatic filtering
  - User invitation system within tenants
  - Tenant statistics and usage tracking
- **Enhanced Audit Logging**: Comprehensive activity tracking
  - Request context capture (IP, user agent, request ID)
  - Expanded audit actions (login, logout, permissions, etc.)
  - Tenant-aware audit history
  - Audit statistics and reporting endpoints
  - Batch audit logging for related operations
- **API Endpoints**:
  - `/api/tenants` - Tenant CRUD (SUPER_ADMIN)
  - `/api/tenants/:id/users` - Tenant user management
  - `/api/tenants/:id/stats` - Tenant statistics
  - `/api/audit-logs` - Audit log queries
  - `/api/audit-logs/stats` - Audit statistics

## v0.1.5 (2025-12-01)
- **UX Improvement**: UEN and SSIC codes displayed as plain text instead of badge/code styling
- Cleaner, less cluttered appearance in company tables and detail pages

## v0.1.4 (2025-12-01)
- **Light/Dark Theme Support**: Implemented light mode as default with dark mode toggle
- Theme toggle in sidebar (desktop and mobile)
- Theme preference persisted to localStorage
- CSS variables for all colors, enabling easy theme switching
- Soft off-white light mode palette (less glaring than pure white)
- Improved collapsed sidebar layout (toggle button centered, no overflow)

## v0.1.3 (2025-12-01)
- **UI Consistency**: Standardized all buttons, inputs, and layout elements
- All buttons use `btn-sm` size class
- All inputs use `input input-sm` classes
- Consistent page padding, headers, and typography

## v0.1.2 (2025-12-01)
- **UI/UX Improvements**: Updated button and card styling
- Buttons use `rounded-lg`, cards use `rounded-xl`
- Improved badge font sizing and padding
- Status badges display proper labels

## v0.1.1 (2025-12-01)
- **Infrastructure Improvements**: Added essential UI components
- Modal, ConfirmDialog, Dropdown, Toast components
- ErrorBoundary for graceful error handling
- Mobile-responsive sidebar with drawer
- Route-level loading and error states
- JWT security fix (no fallback in production)

## v0.1.0 (Initial)
- Core Company Management module
- Authentication with JWT
- BizFile PDF upload and AI extraction
- Audit logging
