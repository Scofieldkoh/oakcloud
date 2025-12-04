import { PrismaClient, EntityType, CompanyStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Database seed script for Oakcloud
 *
 * This script is idempotent - it can be run multiple times safely.
 * It creates:
 * - A default tenant for development
 * - A super admin user (system-wide, no tenant)
 * - A tenant admin user (assigned to default tenant)
 * - Sample companies with addresses, directors, and shareholders
 * - Audit logs for seeded data
 *
 * Usage: npm run db:seed
 */

async function main() {
  console.log('Seeding database...\n');

  // =========================================================================
  // STEP 1: Create default tenant
  // =========================================================================
  console.log('Step 1: Creating default tenant...');

  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {
      // Update existing tenant to ensure it's active
      status: 'ACTIVE',
    },
    create: {
      name: 'Default Tenant',
      slug: 'default',
      status: 'ACTIVE',
      contactEmail: 'admin@oakcloud.local',
      maxUsers: 50,
      maxCompanies: 100,
      maxStorageMb: 10240,
    },
  });

  console.log(`  Created/updated tenant: ${defaultTenant.name} (${defaultTenant.id})\n`);

  // =========================================================================
  // STEP 2: Create users
  // =========================================================================
  console.log('Step 2: Creating users...');

  const passwordHash = await bcrypt.hash('admin123', 10);

  // Super Admin (no tenant - system-wide admin)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@oakcloud.local' },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      email: 'admin@oakcloud.local',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      isActive: true,
    },
  });
  console.log(`  Super Admin: ${superAdmin.email}`);

  // Tenant Admin (assigned to default tenant)
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'tenant@oakcloud.local' },
    update: {
      passwordHash,
      tenantId: defaultTenant.id,
      isActive: true,
    },
    create: {
      email: 'tenant@oakcloud.local',
      passwordHash,
      firstName: 'Tenant',
      lastName: 'Admin',
      tenantId: defaultTenant.id,
      isActive: true,
    },
  });
  console.log(`  Tenant Admin: ${tenantAdmin.email}\n`);

  // =========================================================================
  // STEP 3: Seed permissions
  // =========================================================================
  console.log('Step 3: Seeding permissions...');

  const RESOURCES = [
    'tenant',
    'user',
    'role',
    'company',
    'contact',
    'document',
    'officer',
    'shareholder',
    'audit_log',
  ];

  const ACTIONS = [
    'create',
    'read',
    'update',
    'delete',
    'export',
    'import',
    'manage',
  ];

  const PERMISSION_DESCRIPTIONS: Record<string, Record<string, string>> = {
    tenant: {
      create: 'Create new tenants',
      read: 'View tenant information',
      update: 'Update tenant settings',
      delete: 'Delete tenants',
      export: 'Export tenant data',
      import: 'Import tenant data',
      manage: 'Full tenant management',
    },
    user: {
      create: 'Invite new users',
      read: 'View user profiles',
      update: 'Update user information',
      delete: 'Remove users',
      export: 'Export user data',
      import: 'Import users',
      manage: 'Full user management',
    },
    role: {
      create: 'Create custom roles',
      read: 'View roles and permissions',
      update: 'Update role permissions',
      delete: 'Delete custom roles',
      export: 'Export role definitions',
      import: 'Import role definitions',
      manage: 'Full role management',
    },
    company: {
      create: 'Create new companies',
      read: 'View company information',
      update: 'Update company details',
      delete: 'Delete companies',
      export: 'Export company data',
      import: 'Import company data',
      manage: 'Full company management',
    },
    contact: {
      create: 'Create new contacts',
      read: 'View contact information',
      update: 'Update contact details',
      delete: 'Delete contacts',
      export: 'Export contact data',
      import: 'Import contact data',
      manage: 'Full contact management',
    },
    document: {
      create: 'Upload documents',
      read: 'View and download documents',
      update: 'Update document metadata',
      delete: 'Delete documents',
      export: 'Export documents',
      import: 'Import documents',
      manage: 'Full document management',
    },
    officer: {
      create: 'Add company officers',
      read: 'View officer information',
      update: 'Update officer details',
      delete: 'Remove officers',
      export: 'Export officer data',
      import: 'Import officer data',
      manage: 'Full officer management',
    },
    shareholder: {
      create: 'Add shareholders',
      read: 'View shareholder information',
      update: 'Update shareholder details',
      delete: 'Remove shareholders',
      export: 'Export shareholder data',
      import: 'Import shareholder data',
      manage: 'Full shareholder management',
    },
    audit_log: {
      create: 'Create audit entries',
      read: 'View audit logs',
      update: 'Update audit entries',
      delete: 'Delete audit entries',
      export: 'Export audit logs',
      import: 'Import audit logs',
      manage: 'Full audit management',
    },
  };

  let permissionCount = 0;
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const description = PERMISSION_DESCRIPTIONS[resource]?.[action] || `${action} ${resource}`;
      await prisma.permission.upsert({
        where: {
          resource_action: {
            resource,
            action,
          },
        },
        update: {
          description,
        },
        create: {
          resource,
          action,
          description,
        },
      });
      permissionCount++;
    }
  }
  console.log(`  Created/updated ${permissionCount} permissions\n`);

  // =========================================================================
  // STEP 4: Create system roles for default tenant
  // =========================================================================
  console.log('Step 4: Creating system roles for default tenant...');

  // Get all permissions for role assignments
  const allPermissions = await prisma.permission.findMany();
  const permissionMap = new Map(
    allPermissions.map((p) => [`${p.resource}:${p.action}`, p.id])
  );

  // Define system role permissions
  const TENANT_ADMIN_PERMISSIONS = [
    'user:create', 'user:read', 'user:update', 'user:delete', 'user:manage',
    'role:create', 'role:read', 'role:update', 'role:delete', 'role:manage',
    'company:create', 'company:read', 'company:update', 'company:delete', 'company:export', 'company:manage',
    'contact:create', 'contact:read', 'contact:update', 'contact:delete', 'contact:export', 'contact:manage',
    'document:create', 'document:read', 'document:update', 'document:delete', 'document:export', 'document:manage',
    'officer:create', 'officer:read', 'officer:update', 'officer:delete', 'officer:export', 'officer:manage',
    'shareholder:create', 'shareholder:read', 'shareholder:update', 'shareholder:delete', 'shareholder:export', 'shareholder:manage',
    'audit_log:read', 'audit_log:export',
  ];

  const COMPANY_ADMIN_PERMISSIONS = [
    'company:read', 'company:update',
    'contact:create', 'contact:read', 'contact:update', 'contact:delete',
    'document:create', 'document:read', 'document:update', 'document:delete',
    'officer:create', 'officer:read', 'officer:update', 'officer:delete',
    'shareholder:create', 'shareholder:read', 'shareholder:update', 'shareholder:delete',
    'audit_log:read',
  ];

  const COMPANY_USER_PERMISSIONS = [
    'company:read',
    'contact:read',
    'document:read',
    'officer:read',
    'shareholder:read',
    'audit_log:read',
  ];

  // System role type mapping for proper auth checks
  const SYSTEM_ROLE_TYPE_MAP: Record<string, string> = {
    'Tenant Admin': 'TENANT_ADMIN',
    'Company Admin': 'COMPANY_ADMIN',
    'Company User': 'COMPANY_USER',
  };

  const systemRoles = [
    {
      name: 'Tenant Admin',
      description: 'Full access to all tenant resources',
      permissions: TENANT_ADMIN_PERMISSIONS,
    },
    {
      name: 'Company Admin',
      description: 'Manage assigned company and its data',
      permissions: COMPANY_ADMIN_PERMISSIONS,
    },
    {
      name: 'Company User',
      description: 'View-only access to assigned company',
      permissions: COMPANY_USER_PERMISSIONS,
    },
  ];

  // Track created roles for assignment later
  const createdRoles: Record<string, string> = {};

  for (const roleData of systemRoles) {
    const systemRoleType = SYSTEM_ROLE_TYPE_MAP[roleData.name];

    // Upsert the role with systemRoleType
    const role = await prisma.role.upsert({
      where: {
        tenantId_name: {
          tenantId: defaultTenant.id,
          name: roleData.name,
        },
      },
      update: {
        description: roleData.description,
        systemRoleType, // Ensure systemRoleType is set on update too
      },
      create: {
        tenantId: defaultTenant.id,
        name: roleData.name,
        description: roleData.description,
        isSystem: true,
        systemRoleType,
      },
    });

    createdRoles[roleData.name] = role.id;

    // Clear existing role permissions and re-add
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    // Add permissions to role
    const permissionIds = roleData.permissions
      .map((p) => permissionMap.get(p))
      .filter((id): id is string => !!id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    console.log(`  Created/updated role: ${role.name} (${permissionIds.length} permissions)`);
  }

  // Create global SUPER_ADMIN role (no tenantId - system-wide)
  // Using a special ID pattern to avoid conflicts with tenant-scoped unique constraint
  const superAdminRole = await prisma.role.upsert({
    where: {
      id: 'super-admin-global-role', // Fixed ID for the global super admin role
    },
    update: {
      name: 'Super Admin',
      description: 'System-wide administrator with full access',
      systemRoleType: 'SUPER_ADMIN',
    },
    create: {
      id: 'super-admin-global-role',
      tenantId: null, // Global role, not tied to any tenant
      name: 'Super Admin',
      description: 'System-wide administrator with full access',
      isSystem: true,
      systemRoleType: 'SUPER_ADMIN',
    },
  });
  console.log(`  Created/updated global role: Super Admin`);

  // Assign SUPER_ADMIN role to super admin user
  // Check if assignment already exists (companyId is null for tenant-wide roles)
  const existingSuperAdminAssignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
      companyId: null,
    },
  });

  if (!existingSuperAdminAssignment) {
    await prisma.userRoleAssignment.create({
      data: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
        companyId: null,
      },
    });
  }
  console.log(`  Assigned Super Admin role to: ${superAdmin.email}`);

  // Assign TENANT_ADMIN role to tenant admin user
  const tenantAdminRoleId = createdRoles['Tenant Admin'];
  if (tenantAdminRoleId) {
    const existingTenantAdminAssignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: tenantAdmin.id,
        roleId: tenantAdminRoleId,
        companyId: null,
      },
    });

    if (!existingTenantAdminAssignment) {
      await prisma.userRoleAssignment.create({
        data: {
          userId: tenantAdmin.id,
          roleId: tenantAdminRoleId,
          companyId: null,
        },
      });
    }
    console.log(`  Assigned Tenant Admin role to: ${tenantAdmin.email}`);
  }

  // =========================================================================
  // STEP 4b: Create default custom roles
  // =========================================================================
  console.log('\nStep 4b: Creating default custom roles...');

  // Import from rbac.ts to ensure consistency
  const { DEFAULT_CUSTOM_ROLES } = await import('../src/lib/rbac');

  for (const roleData of DEFAULT_CUSTOM_ROLES) {
    // Check if role already exists
    const existing = await prisma.role.findUnique({
      where: {
        tenantId_name: {
          tenantId: defaultTenant.id,
          name: roleData.name,
        },
      },
    });

    if (existing) {
      console.log(`  Skipping existing role: ${roleData.name}`);
      continue;
    }

    // Create the custom role
    const role = await prisma.role.create({
      data: {
        tenantId: defaultTenant.id,
        name: roleData.name,
        description: roleData.description,
        isSystem: false, // Custom roles are not system roles
      },
    });

    // Add permissions to role
    const permissionIds = roleData.permissions
      .map((p) => permissionMap.get(p))
      .filter((id): id is string => !!id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    console.log(`  Created custom role: ${role.name} (${permissionIds.length} permissions)`);
  }
  console.log('');

  // =========================================================================
  // STEP 5: Create sample companies
  // =========================================================================
  console.log('Step 5: Creating sample companies...');

  const companiesData = [
    {
      uen: '202012345A',
      name: 'Oakcloud Technologies Pte Ltd',
      entityType: EntityType.PRIVATE_LIMITED,
      status: CompanyStatus.LIVE,
      incorporationDate: new Date('2020-03-15'),
      primarySsicCode: '62011',
      primarySsicDescription: 'Development of software and applications',
      financialYearEndDay: 31,
      financialYearEndMonth: 12,
      paidUpCapitalAmount: 100000,
      issuedCapitalAmount: 100000,
    },
    {
      uen: '201923456B',
      name: 'Green Leaf Accounting Services Pte Ltd',
      entityType: EntityType.PRIVATE_LIMITED,
      status: CompanyStatus.LIVE,
      incorporationDate: new Date('2019-06-20'),
      primarySsicCode: '69201',
      primarySsicDescription: 'Accounting, bookkeeping and auditing activities',
      financialYearEndDay: 31,
      financialYearEndMonth: 3,
      paidUpCapitalAmount: 50000,
      issuedCapitalAmount: 50000,
    },
    {
      uen: '201834567C',
      name: 'Sunrise Trading Co Pte Ltd',
      entityType: EntityType.PRIVATE_LIMITED,
      status: CompanyStatus.LIVE,
      incorporationDate: new Date('2018-11-08'),
      primarySsicCode: '46100',
      primarySsicDescription: 'Wholesale on a fee or contract basis',
      secondarySsicCode: '47190',
      secondarySsicDescription: 'Other retail sale in non-specialised stores',
      financialYearEndDay: 30,
      financialYearEndMonth: 6,
      paidUpCapitalAmount: 250000,
      issuedCapitalAmount: 250000,
      hasCharges: true,
    },
    {
      uen: '202245678D',
      name: 'Digital Solutions Hub Pte Ltd',
      entityType: EntityType.PRIVATE_LIMITED,
      status: CompanyStatus.LIVE,
      incorporationDate: new Date('2022-01-10'),
      primarySsicCode: '62029',
      primarySsicDescription: 'Other software and information technology service activities',
      financialYearEndDay: 31,
      financialYearEndMonth: 12,
      paidUpCapitalAmount: 10000,
      issuedCapitalAmount: 10000,
    },
    {
      uen: '201556789E',
      name: 'Heritage Properties Pte Ltd',
      entityType: EntityType.PRIVATE_LIMITED,
      status: CompanyStatus.STRUCK_OFF,
      incorporationDate: new Date('2015-04-22'),
      primarySsicCode: '68100',
      primarySsicDescription: 'Real estate activities with own or leased property',
      financialYearEndDay: 31,
      financialYearEndMonth: 12,
      paidUpCapitalAmount: 1000000,
      issuedCapitalAmount: 1000000,
    },
  ];

  // Sample directors data (deterministic, not random)
  const directorsTemplate = [
    { firstName: 'John', lastName: 'Tan Wei Ming', nationality: 'SINGAPOREAN' },
    { firstName: 'Sarah', lastName: 'Lim Hui Ling', nationality: 'SINGAPOREAN' },
  ];

  // Sample addresses (deterministic)
  const addressTemplates = [
    { block: '10', level: '12', unit: '01', postalCode: '048623' },
    { block: '25', level: '8', unit: '05', postalCode: '049712' },
    { block: '50', level: '15', unit: '10', postalCode: '018956' },
    { block: '88', level: '20', unit: '15', postalCode: '049318' },
    { block: '100', level: '5', unit: '02', postalCode: '048424' },
  ];

  for (let companyIndex = 0; companyIndex < companiesData.length; companyIndex++) {
    const companyData = companiesData[companyIndex];
    const addressTemplate = addressTemplates[companyIndex];

    // Create company with tenant ID (using compound unique constraint)
    const company = await prisma.company.upsert({
      where: {
        tenantId_uen: {
          tenantId: defaultTenant.id,
          uen: companyData.uen,
        },
      },
      update: {},
      create: {
        ...companyData,
        tenantId: defaultTenant.id,
      },
    });

    // Create registered address (deterministic ID for idempotency)
    const addressId = `${company.id}-registered`;
    await prisma.companyAddress.upsert({
      where: { id: addressId },
      update: {},
      create: {
        id: addressId,
        companyId: company.id,
        addressType: 'REGISTERED_OFFICE',
        streetName: 'Robinson Road',
        block: addressTemplate.block,
        level: addressTemplate.level,
        unit: addressTemplate.unit,
        postalCode: addressTemplate.postalCode,
        fullAddress: `${addressTemplate.block} Robinson Road #${addressTemplate.level}-${addressTemplate.unit} Singapore ${addressTemplate.postalCode}`,
        isCurrent: true,
      },
    });

    // Create directors and shareholders
    for (let i = 0; i < directorsTemplate.length; i++) {
      const director = directorsTemplate[i];
      // Generate consistent NRIC based on company UEN and director index
      const nricNumber = `S${70 + i}${companyData.uen.slice(-5)}${String.fromCharCode(65 + i)}`;
      const fullName = `${director.firstName} ${director.lastName}`;

      // Create or update contact
      const contact = await prisma.contact.upsert({
        where: {
          tenantId_identificationType_identificationNumber: {
            tenantId: defaultTenant.id,
            identificationType: 'NRIC',
            identificationNumber: nricNumber,
          },
        },
        update: {},
        create: {
          tenantId: defaultTenant.id,
          contactType: 'INDIVIDUAL',
          firstName: director.firstName,
          lastName: director.lastName,
          fullName: fullName,
          identificationType: 'NRIC',
          identificationNumber: nricNumber,
          nationality: director.nationality,
        },
      });

      // Check if officer record already exists
      const existingOfficer = await prisma.companyOfficer.findFirst({
        where: {
          companyId: company.id,
          contactId: contact.id,
          role: 'DIRECTOR',
        },
      });

      if (!existingOfficer) {
        await prisma.companyOfficer.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            role: 'DIRECTOR',
            name: fullName,
            identificationType: 'NRIC',
            nationality: director.nationality,
            appointmentDate: company.incorporationDate,
            isCurrent: true,
          },
        });
      }

      // Check if shareholder record already exists
      const existingShareholder = await prisma.companyShareholder.findFirst({
        where: {
          companyId: company.id,
          contactId: contact.id,
        },
      });

      if (!existingShareholder) {
        // Deterministic share count based on index
        const shares = (i + 1) * 25000;
        await prisma.companyShareholder.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            name: fullName,
            shareholderType: 'INDIVIDUAL',
            identificationType: 'NRIC',
            nationality: director.nationality,
            shareClass: 'ORDINARY',
            numberOfShares: shares,
            percentageHeld: 50,
            isCurrent: true,
          },
        });
      }

      // Link contact to company
      await prisma.companyContact.upsert({
        where: {
          companyId_contactId_relationship: {
            companyId: company.id,
            contactId: contact.id,
            relationship: 'Director',
          },
        },
        update: {},
        create: {
          companyId: company.id,
          contactId: contact.id,
          relationship: 'Director',
          isPrimary: i === 0,
        },
      });
    }

    console.log(`  Created company: ${company.name}`);
  }

  // =========================================================================
  // STEP 6: Create audit logs for seeded data
  // =========================================================================
  console.log('\nStep 6: Creating audit logs...');

  const companies = await prisma.company.findMany({
    where: { tenantId: defaultTenant.id },
  });

  for (const company of companies) {
    // Check if audit log already exists for this company creation
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Company',
        entityId: company.id,
        action: 'CREATE',
        changeSource: 'SYSTEM',
      },
    });

    if (!existingLog) {
      await prisma.auditLog.create({
        data: {
          tenantId: defaultTenant.id,
          userId: superAdmin.id,
          companyId: company.id,
          action: 'CREATE',
          entityType: 'Company',
          entityId: company.id,
          changeSource: 'SYSTEM',
          metadata: { seeded: true },
        },
      });
    }
  }

  console.log(`  Created audit logs for ${companies.length} companies\n`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('========================================');
  console.log('Database seeded successfully!');
  console.log('========================================');
  console.log('\nDefault credentials:');
  console.log('  Super Admin:');
  console.log('    Email: admin@oakcloud.local');
  console.log('    Password: admin123');
  console.log('  Tenant Admin:');
  console.log('    Email: tenant@oakcloud.local');
  console.log('    Password: admin123');
  console.log('\nNote: Change these passwords in production!\n');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
