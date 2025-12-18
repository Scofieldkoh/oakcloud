import 'dotenv/config';
import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Database seed script for Oakcloud (Minimal Setup)
 *
 * This script is idempotent - it can be run multiple times safely.
 * Creates only the essential data:
 * - A SUPER_ADMIN user with global role
 * - Core permissions for the RBAC system
 *
 * Usage: npm run db:seed
 */

async function main() {
  console.log('Seeding database (minimal setup)...\n');

  // =========================================================================
  // STEP 1: Create SUPER_ADMIN user
  // =========================================================================
  console.log('Step 1: Creating SUPER_ADMIN user...');

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
  console.log(`  Created/updated SUPER_ADMIN: ${superAdmin.email}\n`);

  // =========================================================================
  // STEP 2: Seed permissions
  // =========================================================================
  console.log('Step 2: Seeding permissions...');

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
    'connector',
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
    connector: {
      create: 'Create connectors',
      read: 'View connectors',
      update: 'Update connector settings',
      delete: 'Delete connectors',
      export: 'Export connector data',
      import: 'Import connector data',
      manage: 'Full connector management',
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
  // STEP 3: Create global SUPER_ADMIN role
  // =========================================================================
  console.log('Step 3: Creating global SUPER_ADMIN role...');

  // Create global SUPER_ADMIN role (no tenantId - system-wide)
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
  console.log(`  Created/updated global role: Super Admin\n`);

  // =========================================================================
  // STEP 4: Assign SUPER_ADMIN role to user
  // =========================================================================
  console.log('Step 4: Assigning SUPER_ADMIN role...');

  // Check if assignment already exists
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
  console.log(`  Assigned Super Admin role to: ${superAdmin.email}\n`);

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
  console.log('\nNote: Change this password in production!');
  console.log('\nTo create tenants, users, and companies, use the');
  console.log('Super Admin account to access the Admin dashboard.\n');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
