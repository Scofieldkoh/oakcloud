const { PrismaClient } = require('./src/generated/prisma');

const prisma = new PrismaClient();

async function checkServices() {
  try {
    // Get all services
    const services = await prisma.contractService.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        contract: {
          select: {
            title: true,
            company: {
              select: {
                id: true,
                name: true,
                tenantId: true,
              },
            },
          },
        },
      },
      take: 10,
    });

    console.log('Total services found:', services.length);
    console.log('\nServices:');
    services.forEach(s => {
      console.log(`- ${s.name} (${s.contract.company.name}) - Tenant: ${s.contract.company.tenantId}`);
    });

    // Get all companies
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
      },
      take: 10,
    });

    console.log('\n\nTotal companies found:', companies.length);
    console.log('\nCompanies:');
    companies.forEach(c => {
      console.log(`- ${c.name} (ID: ${c.id}) - Tenant: ${c.tenantId}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkServices();
