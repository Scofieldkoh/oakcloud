import { PrismaClient, UserRole, EntityType, CompanyStatus } from '@prisma/client';
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
      role: UserRole.SUPER_ADMIN,
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
      role: UserRole.TENANT_ADMIN,
      tenantId: defaultTenant.id,
      isActive: true,
    },
  });
  console.log(`  Tenant Admin: ${tenantAdmin.email}\n`);

  // =========================================================================
  // STEP 3: Create sample companies
  // =========================================================================
  console.log('Step 3: Creating sample companies...');

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

    // Create company with tenant ID
    const company = await prisma.company.upsert({
      where: { uen: companyData.uen },
      update: {
        tenantId: defaultTenant.id,
      },
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
  // STEP 4: Create audit logs for seeded data
  // =========================================================================
  console.log('\nStep 4: Creating audit logs...');

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
