import { PrismaClient, UserRole, EntityType, CompanyStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Super Admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@oakcloud.local' },
    update: {},
    create: {
      email: 'admin@oakcloud.local',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });

  console.log('Created super admin:', superAdmin.email);

  // Create sample companies
  const companies = [
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

  for (const companyData of companies) {
    const company = await prisma.company.upsert({
      where: { uen: companyData.uen },
      update: {},
      create: companyData,
    });

    // Create registered address for each company
    await prisma.companyAddress.upsert({
      where: { id: `${company.id}-registered` },
      update: {},
      create: {
        id: `${company.id}-registered`,
        companyId: company.id,
        addressType: 'REGISTERED_OFFICE',
        streetName: 'Robinson Road',
        block: `${Math.floor(Math.random() * 100) + 1}`,
        level: `${Math.floor(Math.random() * 30) + 1}`,
        unit: `${Math.floor(Math.random() * 20) + 1}`.padStart(2, '0'),
        postalCode: `0${Math.floor(Math.random() * 9000) + 1000}`,
        fullAddress: `${Math.floor(Math.random() * 100) + 1} Robinson Road #${Math.floor(Math.random() * 30) + 1}-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')} Singapore 0${Math.floor(Math.random() * 9000) + 1000}`,
        isCurrent: true,
      },
    });

    // Create sample directors
    const directors = [
      { name: 'John Tan Wei Ming', nationality: 'SINGAPOREAN' },
      { name: 'Sarah Lim Hui Ling', nationality: 'SINGAPOREAN' },
    ];

    for (let i = 0; i < directors.length; i++) {
      const director = directors[i];

      // Create contact
      const contact = await prisma.contact.upsert({
        where: {
          identificationType_identificationNumber: {
            identificationType: 'NRIC',
            identificationNumber: `S${70 + i}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
          },
        },
        update: {},
        create: {
          contactType: 'INDIVIDUAL',
          firstName: director.name.split(' ')[0],
          lastName: director.name.split(' ').slice(1).join(' '),
          fullName: director.name,
          identificationType: 'NRIC',
          identificationNumber: `S${70 + i}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
          nationality: director.nationality,
        },
      });

      // Create officer record
      await prisma.companyOfficer.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          role: 'DIRECTOR',
          name: director.name,
          identificationType: 'NRIC',
          nationality: director.nationality,
          appointmentDate: company.incorporationDate,
          isCurrent: true,
        },
      });

      // Create shareholder record
      const shares = Math.floor(Math.random() * 50000) + 10000;
      await prisma.companyShareholder.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          name: director.name,
          shareholderType: 'INDIVIDUAL',
          identificationType: 'NRIC',
          nationality: director.nationality,
          shareClass: 'ORDINARY',
          numberOfShares: shares,
          percentageHeld: 50,
          isCurrent: true,
        },
      });

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

    console.log('Created company:', company.name);
  }

  // Create audit logs for company creation
  for (const company of await prisma.company.findMany()) {
    await prisma.auditLog.create({
      data: {
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

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
