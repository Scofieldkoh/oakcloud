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

  const superAdminEmail = 'admin@oaktreesolutions.com.sg';
  const legacySuperAdminEmail = 'admin@oakcloud.local';
  const superAdminPassword = 'Preparefortrouble!';
  const passwordHash = await bcrypt.hash(superAdminPassword, 10);

  // Super Admin (no tenant - system-wide admin)
  const existingSuperAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: superAdminEmail },
        { email: legacySuperAdminEmail },
      ],
    },
  });

  const superAdmin = existingSuperAdmin
    ? await prisma.user.update({
      where: { id: existingSuperAdmin.id },
      data: {
        email: superAdminEmail,
        passwordHash,
        isActive: true,
      },
    })
    : await prisma.user.create({
      data: {
        email: superAdminEmail,
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
  // isHeader: true for parent/category accounts that shouldn't be selectable in dropdowns
  // Naming convention: Sentence case (only first character capitalized, except proper nouns)
  const CHART_OF_ACCOUNTS_SEED = [
    // ASSETS (1xxx)
    { code: '1000', name: 'Current assets', type: 'ASSET', parent: null, order: 100, isHeader: true },
    { code: '1100', name: 'Cash and cash equivalents', type: 'ASSET', parent: '1000', order: 110, isHeader: false },
    { code: '1110', name: 'Petty cash', type: 'ASSET', parent: '1000', order: 111, isHeader: false },
    { code: '1120', name: 'Bank accounts', type: 'ASSET', parent: '1000', order: 112, isHeader: false },
    { code: '1200', name: 'Accounts receivable', type: 'ASSET', parent: '1000', order: 120, isHeader: false },
    { code: '1210', name: 'Allowance for doubtful accounts', type: 'ASSET', parent: '1000', order: 121, isHeader: false },
    { code: '1300', name: 'Inventory', type: 'ASSET', parent: '1000', order: 130, isHeader: false },
    { code: '1400', name: 'Prepaid expenses', type: 'ASSET', parent: '1000', order: 140, isHeader: false },
    { code: '1410', name: 'Prepaid insurance', type: 'ASSET', parent: '1000', order: 141, isHeader: false },
    { code: '1420', name: 'Prepaid rent', type: 'ASSET', parent: '1000', order: 142, isHeader: false },
    { code: '1450', name: 'Deposits', type: 'ASSET', parent: '1000', order: 145, isHeader: false },
    { code: '1460', name: 'GST receivable', type: 'ASSET', parent: '1000', order: 146, isHeader: false },
    { code: '1470', name: 'Other receivables', type: 'ASSET', parent: '1000', order: 147, isHeader: false },

    // Fixed Assets
    { code: '1500', name: 'Fixed assets', type: 'ASSET', parent: null, order: 150, isHeader: true },
    { code: '1510', name: 'Property, plant & equipment', type: 'ASSET', parent: '1500', order: 151, isHeader: false },
    { code: '1511', name: 'Accumulated depreciation - property, plant & equipment', type: 'ASSET', parent: '1500', order: 1511, isHeader: false },
    { code: '1520', name: 'Buildings', type: 'ASSET', parent: '1500', order: 152, isHeader: false },
    { code: '1521', name: 'Accumulated depreciation - buildings', type: 'ASSET', parent: '1500', order: 1521, isHeader: false },
    { code: '1530', name: 'Motor vehicles', type: 'ASSET', parent: '1500', order: 153, isHeader: false },
    { code: '1531', name: 'Accumulated depreciation - motor vehicles', type: 'ASSET', parent: '1500', order: 1531, isHeader: false },
    { code: '1540', name: 'Furniture & fittings', type: 'ASSET', parent: '1500', order: 154, isHeader: false },
    { code: '1541', name: 'Accumulated depreciation - furniture & fittings', type: 'ASSET', parent: '1500', order: 1541, isHeader: false },
    { code: '1550', name: 'Office equipment', type: 'ASSET', parent: '1500', order: 155, isHeader: false },
    { code: '1551', name: 'Accumulated depreciation - office equipment', type: 'ASSET', parent: '1500', order: 1551, isHeader: false },
    { code: '1560', name: 'Computer equipment', type: 'ASSET', parent: '1500', order: 156, isHeader: false },
    { code: '1561', name: 'Accumulated depreciation - computer equipment', type: 'ASSET', parent: '1500', order: 1561, isHeader: false },
    { code: '1570', name: 'Leasehold improvements', type: 'ASSET', parent: '1500', order: 157, isHeader: false },
    { code: '1571', name: 'Accumulated depreciation - leasehold improvements', type: 'ASSET', parent: '1500', order: 1571, isHeader: false },
    { code: '1580', name: 'Land', type: 'ASSET', parent: '1500', order: 158, isHeader: false },

    // Intangible Assets
    { code: '1600', name: 'Intangible assets', type: 'ASSET', parent: null, order: 160, isHeader: true },
    { code: '1610', name: 'Software', type: 'ASSET', parent: '1600', order: 161, isHeader: false },
    { code: '1611', name: 'Accumulated amortisation - software', type: 'ASSET', parent: '1600', order: 1611, isHeader: false },
    { code: '1620', name: 'Goodwill', type: 'ASSET', parent: '1600', order: 162, isHeader: false },
    { code: '1630', name: 'Patents', type: 'ASSET', parent: '1600', order: 163, isHeader: false },
    { code: '1631', name: 'Accumulated amortisation - patents', type: 'ASSET', parent: '1600', order: 1631, isHeader: false },
    { code: '1640', name: 'Trademarks', type: 'ASSET', parent: '1600', order: 164, isHeader: false },
    { code: '1641', name: 'Accumulated amortisation - trademarks', type: 'ASSET', parent: '1600', order: 1641, isHeader: false },
    { code: '1650', name: 'Licenses', type: 'ASSET', parent: '1600', order: 165, isHeader: false },
    { code: '1651', name: 'Accumulated amortisation - licenses', type: 'ASSET', parent: '1600', order: 1651, isHeader: false },

    // Other Non-Current Assets
    { code: '1700', name: 'Other non-current assets', type: 'ASSET', parent: null, order: 170, isHeader: true },
    { code: '1710', name: 'Investments', type: 'ASSET', parent: '1700', order: 171, isHeader: false },
    { code: '1720', name: 'Long-term deposits', type: 'ASSET', parent: '1700', order: 172, isHeader: false },

    // LIABILITIES (2xxx)
    { code: '2000', name: 'Current liabilities', type: 'LIABILITY', parent: null, order: 200, isHeader: true },
    { code: '2100', name: 'Accounts payable', type: 'LIABILITY', parent: '2000', order: 210, isHeader: false },
    { code: '2200', name: 'Accrued expenses', type: 'LIABILITY', parent: '2000', order: 220, isHeader: false },
    { code: '2210', name: 'Accrued salaries & wages', type: 'LIABILITY', parent: '2000', order: 221, isHeader: false },
    { code: '2220', name: 'Accrued CPF', type: 'LIABILITY', parent: '2000', order: 222, isHeader: false },
    { code: '2230', name: 'Accrued bonus', type: 'LIABILITY', parent: '2000', order: 223, isHeader: false },
    { code: '2300', name: 'GST payable', type: 'LIABILITY', parent: '2000', order: 230, isHeader: false },
    { code: '2400', name: 'Income tax payable', type: 'LIABILITY', parent: '2000', order: 240, isHeader: false },
    { code: '2410', name: 'Withholding tax payable', type: 'LIABILITY', parent: '2000', order: 241, isHeader: false },
    { code: '2500', name: 'Short-term loans', type: 'LIABILITY', parent: '2000', order: 250, isHeader: false },
    { code: '2510', name: 'Credit card payable', type: 'LIABILITY', parent: '2000', order: 251, isHeader: false },
    { code: '2520', name: 'Current portion of long-term debt', type: 'LIABILITY', parent: '2000', order: 252, isHeader: false },
    { code: '2550', name: 'Unearned revenue', type: 'LIABILITY', parent: '2000', order: 255, isHeader: false },
    { code: '2560', name: 'Deposits received', type: 'LIABILITY', parent: '2000', order: 256, isHeader: false },
    { code: '2570', name: 'Other payables', type: 'LIABILITY', parent: '2000', order: 257, isHeader: false },

    // Long-term Liabilities
    { code: '2600', name: 'Long-term liabilities', type: 'LIABILITY', parent: null, order: 260, isHeader: true },
    { code: '2610', name: 'Long-term loans', type: 'LIABILITY', parent: '2600', order: 261, isHeader: false },
    { code: '2620', name: 'Deferred tax liabilities', type: 'LIABILITY', parent: '2600', order: 262, isHeader: false },
    { code: '2630', name: 'Finance lease liabilities', type: 'LIABILITY', parent: '2600', order: 263, isHeader: false },
    { code: '2640', name: 'Hire purchase liabilities', type: 'LIABILITY', parent: '2600', order: 264, isHeader: false },

    // EQUITY (3xxx)
    { code: '3000', name: 'Equity', type: 'EQUITY', parent: null, order: 300, isHeader: true },
    { code: '3100', name: 'Share capital', type: 'EQUITY', parent: '3000', order: 310, isHeader: false },
    { code: '3110', name: 'Ordinary shares', type: 'EQUITY', parent: '3000', order: 311, isHeader: false },
    { code: '3120', name: 'Preference shares', type: 'EQUITY', parent: '3000', order: 312, isHeader: false },
    { code: '3200', name: 'Retained earnings', type: 'EQUITY', parent: '3000', order: 320, isHeader: false },
    { code: '3300', name: 'Reserves', type: 'EQUITY', parent: '3000', order: 330, isHeader: false },
    { code: '3310', name: 'Capital reserves', type: 'EQUITY', parent: '3000', order: 331, isHeader: false },
    { code: '3320', name: 'Foreign currency translation reserve', type: 'EQUITY', parent: '3000', order: 332, isHeader: false },
    { code: '3400', name: 'Dividends', type: 'EQUITY', parent: '3000', order: 340, isHeader: false },
    { code: '3500', name: 'Current year earnings', type: 'EQUITY', parent: '3000', order: 350, isHeader: false },

    // REVENUE (4xxx)
    { code: '4000', name: 'Revenue', type: 'REVENUE', parent: null, order: 400, isHeader: true },
    { code: '4100', name: 'Sales revenue', type: 'REVENUE', parent: '4000', order: 410, isHeader: false },
    { code: '4110', name: 'Product sales', type: 'REVENUE', parent: '4000', order: 411, isHeader: false },
    { code: '4120', name: 'Sales discounts', type: 'REVENUE', parent: '4000', order: 412, isHeader: false },
    { code: '4130', name: 'Sales returns', type: 'REVENUE', parent: '4000', order: 413, isHeader: false },
    { code: '4200', name: 'Service revenue', type: 'REVENUE', parent: '4000', order: 420, isHeader: false },
    { code: '4210', name: 'Consulting income', type: 'REVENUE', parent: '4000', order: 421, isHeader: false },
    { code: '4220', name: 'Commission income', type: 'REVENUE', parent: '4000', order: 422, isHeader: false },
    { code: '4230', name: 'Management fee income', type: 'REVENUE', parent: '4000', order: 423, isHeader: false },
    { code: '4300', name: 'Interest income', type: 'REVENUE', parent: '4000', order: 430, isHeader: false },
    { code: '4400', name: 'Other income', type: 'REVENUE', parent: '4000', order: 440, isHeader: false },
    { code: '4410', name: 'Dividend income', type: 'REVENUE', parent: '4000', order: 441, isHeader: false },
    { code: '4420', name: 'Rental income', type: 'REVENUE', parent: '4000', order: 442, isHeader: false },
    { code: '4430', name: 'Foreign exchange gain', type: 'REVENUE', parent: '4000', order: 443, isHeader: false },
    { code: '4440', name: 'Gain on disposal of assets', type: 'REVENUE', parent: '4000', order: 444, isHeader: false },
    { code: '4450', name: 'Government grants', type: 'REVENUE', parent: '4000', order: 445, isHeader: false },

    // COST OF GOODS SOLD (5xxx)
    { code: '5000', name: 'Cost of goods sold', type: 'EXPENSE', parent: null, order: 500, isHeader: true },
    { code: '5100', name: 'Direct labour', type: 'EXPENSE', parent: '5000', order: 510, isHeader: false },
    { code: '5200', name: 'Direct materials', type: 'EXPENSE', parent: '5000', order: 520, isHeader: false },
    { code: '5210', name: 'Purchases', type: 'EXPENSE', parent: '5000', order: 521, isHeader: false },
    { code: '5220', name: 'Purchase discounts', type: 'EXPENSE', parent: '5000', order: 522, isHeader: false },
    { code: '5230', name: 'Purchase returns', type: 'EXPENSE', parent: '5000', order: 523, isHeader: false },
    { code: '5240', name: 'Freight inwards', type: 'EXPENSE', parent: '5000', order: 524, isHeader: false },
    { code: '5300', name: 'Manufacturing overhead', type: 'EXPENSE', parent: '5000', order: 530, isHeader: false },
    { code: '5400', name: 'Direct software costs', type: 'EXPENSE', parent: '5000', order: 540, isHeader: false },
    { code: '5500', name: 'Subcontractor costs', type: 'EXPENSE', parent: '5000', order: 550, isHeader: false },
    { code: '5600', name: 'Other direct costs', type: 'EXPENSE', parent: '5000', order: 560, isHeader: false },

    // OPERATING EXPENSES (6xxx-7xxx)
    { code: '6000', name: 'Operating expenses', type: 'EXPENSE', parent: null, order: 600, isHeader: true },
    { code: '6100', name: 'Advertising & marketing', type: 'EXPENSE', parent: '6000', order: 610, isHeader: false },
    { code: '6110', name: 'Website & online marketing', type: 'EXPENSE', parent: '6000', order: 611, isHeader: false },
    { code: '6120', name: 'Promotional materials', type: 'EXPENSE', parent: '6000', order: 612, isHeader: false },
    { code: '6200', name: 'Bank charges', type: 'EXPENSE', parent: '6000', order: 620, isHeader: false },
    { code: '6210', name: 'Merchant fees', type: 'EXPENSE', parent: '6000', order: 621, isHeader: false },
    { code: '6300', name: 'Depreciation expense', type: 'EXPENSE', parent: '6000', order: 630, isHeader: false },
    { code: '6310', name: 'Amortisation expense', type: 'EXPENSE', parent: '6000', order: 631, isHeader: false },
    { code: '6400', name: 'Insurance', type: 'EXPENSE', parent: '6000', order: 640, isHeader: false },
    { code: '6410', name: 'General insurance', type: 'EXPENSE', parent: '6000', order: 641, isHeader: false },
    { code: '6420', name: 'Professional indemnity insurance', type: 'EXPENSE', parent: '6000', order: 642, isHeader: false },
    { code: '6430', name: 'Workman compensation insurance', type: 'EXPENSE', parent: '6000', order: 643, isHeader: false },
    { code: '6500', name: 'Office supplies', type: 'EXPENSE', parent: '6000', order: 650, isHeader: false },
    { code: '6510', name: 'Stationery & printing', type: 'EXPENSE', parent: '6000', order: 651, isHeader: false },
    { code: '6520', name: 'Postage & courier', type: 'EXPENSE', parent: '6000', order: 652, isHeader: false },
    { code: '6600', name: 'Professional fees', type: 'EXPENSE', parent: '6000', order: 660, isHeader: false },
    { code: '6610', name: 'Accounting fees', type: 'EXPENSE', parent: '6000', order: 661, isHeader: false },
    { code: '6620', name: 'Audit fees', type: 'EXPENSE', parent: '6000', order: 662, isHeader: false },
    { code: '6630', name: 'Legal fees', type: 'EXPENSE', parent: '6000', order: 663, isHeader: false },
    { code: '6640', name: 'Consulting fees', type: 'EXPENSE', parent: '6000', order: 664, isHeader: false },
    { code: '6650', name: 'Corporate secretarial fees', type: 'EXPENSE', parent: '6000', order: 665, isHeader: false },
    { code: '6660', name: 'Tax advisory fees', type: 'EXPENSE', parent: '6000', order: 666, isHeader: false },
    { code: '6700', name: 'Rent expense', type: 'EXPENSE', parent: '6000', order: 670, isHeader: false },
    { code: '6710', name: 'Office rent', type: 'EXPENSE', parent: '6000', order: 671, isHeader: false },
    { code: '6720', name: 'Equipment rental', type: 'EXPENSE', parent: '6000', order: 672, isHeader: false },
    { code: '6800', name: 'Repairs & maintenance', type: 'EXPENSE', parent: '6000', order: 680, isHeader: false },
    { code: '6810', name: 'Building maintenance', type: 'EXPENSE', parent: '6000', order: 681, isHeader: false },
    { code: '6820', name: 'Equipment maintenance', type: 'EXPENSE', parent: '6000', order: 682, isHeader: false },
    { code: '6830', name: 'IT maintenance', type: 'EXPENSE', parent: '6000', order: 683, isHeader: false },
    { code: '6900', name: 'Telephone & internet', type: 'EXPENSE', parent: '6000', order: 690, isHeader: false },
    { code: '6910', name: 'Mobile phone expenses', type: 'EXPENSE', parent: '6000', order: 691, isHeader: false },
    { code: '6920', name: 'Software subscriptions', type: 'EXPENSE', parent: '6000', order: 692, isHeader: false },
    { code: '7000', name: 'Travel & entertainment', type: 'EXPENSE', parent: '6000', order: 700, isHeader: false },
    { code: '7010', name: 'Local transport', type: 'EXPENSE', parent: '6000', order: 701, isHeader: false },
    { code: '7020', name: 'Overseas travel', type: 'EXPENSE', parent: '6000', order: 702, isHeader: false },
    { code: '7030', name: 'Staff meals & entertainment', type: 'EXPENSE', parent: '6000', order: 703, isHeader: false },
    { code: '7040', name: 'Client entertainment', type: 'EXPENSE', parent: '6000', order: 704, isHeader: false },
    { code: '7100', name: 'Utilities', type: 'EXPENSE', parent: '6000', order: 710, isHeader: false },
    { code: '7110', name: 'Electricity', type: 'EXPENSE', parent: '6000', order: 711, isHeader: false },
    { code: '7120', name: 'Water', type: 'EXPENSE', parent: '6000', order: 712, isHeader: false },
    { code: '7200', name: 'Salaries & wages', type: 'EXPENSE', parent: '6000', order: 720, isHeader: false },
    { code: '7210', name: 'Director fees', type: 'EXPENSE', parent: '6000', order: 721, isHeader: false },
    { code: '7220', name: 'Staff salaries', type: 'EXPENSE', parent: '6000', order: 722, isHeader: false },
    { code: '7230', name: 'Bonus', type: 'EXPENSE', parent: '6000', order: 723, isHeader: false },
    { code: '7240', name: 'Overtime', type: 'EXPENSE', parent: '6000', order: 724, isHeader: false },
    { code: '7250', name: 'Commission expense', type: 'EXPENSE', parent: '6000', order: 725, isHeader: false },
    { code: '7300', name: 'CPF contributions', type: 'EXPENSE', parent: '6000', order: 730, isHeader: false },
    { code: '7310', name: 'Skills development levy', type: 'EXPENSE', parent: '6000', order: 731, isHeader: false },
    { code: '7320', name: 'Foreign worker levy', type: 'EXPENSE', parent: '6000', order: 732, isHeader: false },
    { code: '7400', name: 'Training & development', type: 'EXPENSE', parent: '6000', order: 740, isHeader: false },
    { code: '7410', name: 'Staff welfare', type: 'EXPENSE', parent: '6000', order: 741, isHeader: false },
    { code: '7420', name: 'Medical expenses', type: 'EXPENSE', parent: '6000', order: 742, isHeader: false },
    { code: '7430', name: 'Staff insurance', type: 'EXPENSE', parent: '6000', order: 743, isHeader: false },
    { code: '7440', name: 'Recruitment expenses', type: 'EXPENSE', parent: '6000', order: 744, isHeader: false },
    { code: '7500', name: 'Foreign exchange loss', type: 'EXPENSE', parent: '6000', order: 750, isHeader: false },
    { code: '7600', name: 'Bad debts', type: 'EXPENSE', parent: '6000', order: 760, isHeader: false },
    { code: '7610', name: 'Provision for doubtful debts', type: 'EXPENSE', parent: '6000', order: 761, isHeader: false },
    { code: '7700', name: 'Interest expense', type: 'EXPENSE', parent: '6000', order: 770, isHeader: false },
    { code: '7710', name: 'Loan interest', type: 'EXPENSE', parent: '6000', order: 771, isHeader: false },
    { code: '7720', name: 'Finance lease interest', type: 'EXPENSE', parent: '6000', order: 772, isHeader: false },
    { code: '7800', name: 'Government fees & licenses', type: 'EXPENSE', parent: '6000', order: 780, isHeader: false },
    { code: '7810', name: 'Business registration fees', type: 'EXPENSE', parent: '6000', order: 781, isHeader: false },
    { code: '7820', name: 'Permit & license fees', type: 'EXPENSE', parent: '6000', order: 782, isHeader: false },
    { code: '7830', name: 'Property tax', type: 'EXPENSE', parent: '6000', order: 783, isHeader: false },
    { code: '7900', name: 'Other expenses', type: 'EXPENSE', parent: '6000', order: 790, isHeader: false },
    { code: '7910', name: 'Donations', type: 'EXPENSE', parent: '6000', order: 791, isHeader: false },
    { code: '7920', name: 'Fines & penalties', type: 'EXPENSE', parent: '6000', order: 792, isHeader: false },
    { code: '7930', name: 'Loss on disposal of assets', type: 'EXPENSE', parent: '6000', order: 793, isHeader: false },
    { code: '7940', name: 'Miscellaneous expenses', type: 'EXPENSE', parent: '6000', order: 794, isHeader: false },

    // TAX EXPENSES (8xxx)
    { code: '8000', name: 'Tax expenses', type: 'EXPENSE', parent: null, order: 800, isHeader: true },
    { code: '8100', name: 'Income tax expense', type: 'EXPENSE', parent: '8000', order: 810, isHeader: false },
    { code: '8200', name: 'Deferred tax expense', type: 'EXPENSE', parent: '8000', order: 820, isHeader: false },
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
      // Update name and isHeader for existing accounts
      await prisma.chartOfAccount.update({
        where: { id: existing.id },
        data: {
          name: account.name,
          isHeader: account.isHeader,
          sortOrder: account.order,
        },
      });
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
          isHeader: account.isHeader,
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
  console.log('    Email: admin@oaktreesolutions.com.sg');
  console.log('    Password: Preparefortrouble!');
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
