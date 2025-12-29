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
    'chart_of_accounts',
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
    chart_of_accounts: {
      create: 'Create chart of accounts entries',
      read: 'View chart of accounts',
      update: 'Update chart of accounts entries',
      delete: 'Delete chart of accounts entries',
      export: 'Export chart of accounts',
      import: 'Import chart of accounts',
      manage: 'Full chart of accounts management',
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
  // STEP 5: Seed Chart of Accounts (System-level defaults)
  // =========================================================================
  console.log('Step 5: Seeding Chart of Accounts...');

  // Standard Singapore Chart of Accounts aligned with SFRS
  const CHART_OF_ACCOUNTS_SEED = [
    // ASSETS (1xxx)
    { code: '1000', name: 'Current Assets', type: 'ASSET', parent: null, order: 100 },
    { code: '1100', name: 'Cash and Cash Equivalents', type: 'ASSET', parent: '1000', order: 110 },
    { code: '1200', name: 'Accounts Receivable', type: 'ASSET', parent: '1000', order: 120 },
    { code: '1300', name: 'Inventory', type: 'ASSET', parent: '1000', order: 130 },
    { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', parent: '1000', order: 140 },
    { code: '1500', name: 'Fixed Assets', type: 'ASSET', parent: null, order: 150 },
    { code: '1510', name: 'Property, Plant & Equipment', type: 'ASSET', parent: '1500', order: 151 },
    { code: '1520', name: 'Accumulated Depreciation', type: 'ASSET', parent: '1500', order: 152 },
    { code: '1600', name: 'Intangible Assets', type: 'ASSET', parent: null, order: 160 },

    // LIABILITIES (2xxx)
    { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', parent: null, order: 200 },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', parent: '2000', order: 210 },
    { code: '2200', name: 'Accrued Expenses', type: 'LIABILITY', parent: '2000', order: 220 },
    { code: '2300', name: 'GST Payable', type: 'LIABILITY', parent: '2000', order: 230 },
    { code: '2400', name: 'Income Tax Payable', type: 'LIABILITY', parent: '2000', order: 240 },
    { code: '2500', name: 'Short-term Loans', type: 'LIABILITY', parent: '2000', order: 250 },
    { code: '2600', name: 'Long-term Liabilities', type: 'LIABILITY', parent: null, order: 260 },
    { code: '2610', name: 'Long-term Loans', type: 'LIABILITY', parent: '2600', order: 261 },
    { code: '2620', name: 'Deferred Tax Liabilities', type: 'LIABILITY', parent: '2600', order: 262 },

    // EQUITY (3xxx)
    { code: '3000', name: 'Equity', type: 'EQUITY', parent: null, order: 300 },
    { code: '3100', name: 'Share Capital', type: 'EQUITY', parent: '3000', order: 310 },
    { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parent: '3000', order: 320 },
    { code: '3300', name: 'Reserves', type: 'EQUITY', parent: '3000', order: 330 },
    { code: '3400', name: 'Dividends', type: 'EQUITY', parent: '3000', order: 340 },

    // REVENUE (4xxx)
    { code: '4000', name: 'Revenue', type: 'REVENUE', parent: null, order: 400 },
    { code: '4100', name: 'Sales Revenue', type: 'REVENUE', parent: '4000', order: 410 },
    { code: '4200', name: 'Service Revenue', type: 'REVENUE', parent: '4000', order: 420 },
    { code: '4300', name: 'Interest Income', type: 'REVENUE', parent: '4000', order: 430 },
    { code: '4400', name: 'Other Income', type: 'REVENUE', parent: '4000', order: 440 },

    // COST OF GOODS SOLD (5xxx)
    { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', parent: null, order: 500 },
    { code: '5100', name: 'Direct Labor', type: 'EXPENSE', parent: '5000', order: 510 },
    { code: '5200', name: 'Direct Materials', type: 'EXPENSE', parent: '5000', order: 520 },
    { code: '5300', name: 'Manufacturing Overhead', type: 'EXPENSE', parent: '5000', order: 530 },

    // OPERATING EXPENSES (6xxx-7xxx)
    { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', parent: null, order: 600 },
    { code: '6100', name: 'Advertising & Marketing', type: 'EXPENSE', parent: '6000', order: 610 },
    { code: '6200', name: 'Bank Charges', type: 'EXPENSE', parent: '6000', order: 620 },
    { code: '6300', name: 'Depreciation', type: 'EXPENSE', parent: '6000', order: 630 },
    { code: '6400', name: 'Insurance', type: 'EXPENSE', parent: '6000', order: 640 },
    { code: '6500', name: 'Office Supplies', type: 'EXPENSE', parent: '6000', order: 650 },
    { code: '6600', name: 'Professional Fees', type: 'EXPENSE', parent: '6000', order: 660 },
    { code: '6700', name: 'Rent', type: 'EXPENSE', parent: '6000', order: 670 },
    { code: '6800', name: 'Repairs & Maintenance', type: 'EXPENSE', parent: '6000', order: 680 },
    { code: '6900', name: 'Telephone & Internet', type: 'EXPENSE', parent: '6000', order: 690 },
    { code: '7000', name: 'Travel & Entertainment', type: 'EXPENSE', parent: '6000', order: 700 },
    { code: '7100', name: 'Utilities', type: 'EXPENSE', parent: '6000', order: 710 },
    { code: '7200', name: 'Salaries & Wages', type: 'EXPENSE', parent: '6000', order: 720 },
    { code: '7300', name: 'CPF Contributions', type: 'EXPENSE', parent: '6000', order: 730 },
    { code: '7400', name: 'Training & Development', type: 'EXPENSE', parent: '6000', order: 740 },
    { code: '7500', name: 'Foreign Exchange Loss', type: 'EXPENSE', parent: '6000', order: 750 },
    { code: '7600', name: 'Bad Debts', type: 'EXPENSE', parent: '6000', order: 760 },
    { code: '7900', name: 'Other Expenses', type: 'EXPENSE', parent: '6000', order: 790 },

    // TAX EXPENSES (8xxx)
    { code: '8000', name: 'Tax Expenses', type: 'EXPENSE', parent: null, order: 800 },
    { code: '8100', name: 'Income Tax Expense', type: 'EXPENSE', parent: '8000', order: 810 },
    { code: '8200', name: 'Deferred Tax Expense', type: 'EXPENSE', parent: '8000', order: 820 },
  ];

  // First pass: create accounts without parent references
  const accountIdMap: Record<string, string> = {};
  for (const account of CHART_OF_ACCOUNTS_SEED) {
    const existing = await prisma.chartOfAccount.findFirst({
      where: {
        tenantId: null,
        companyId: null,
        code: account.code,
        deletedAt: null,
      },
    });

    if (existing) {
      accountIdMap[account.code] = existing.id;
    } else {
      const created = await prisma.chartOfAccount.create({
        data: {
          tenantId: null,
          companyId: null,
          code: account.code,
          name: account.name,
          accountType: account.type as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
          status: 'ACTIVE',
          sortOrder: account.order,
          isSystem: true,
          isTaxApplicable: account.type === 'EXPENSE' || account.type === 'REVENUE',
        },
      });
      accountIdMap[account.code] = created.id;
    }
  }

  // Second pass: update parent references
  for (const account of CHART_OF_ACCOUNTS_SEED) {
    if (account.parent) {
      const parentId = accountIdMap[account.parent];
      if (parentId) {
        await prisma.chartOfAccount.update({
          where: { id: accountIdMap[account.code] },
          data: { parentId },
        });
      }
    }
  }

  console.log(`  Created/updated ${CHART_OF_ACCOUNTS_SEED.length} chart of accounts entries\n`);

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
