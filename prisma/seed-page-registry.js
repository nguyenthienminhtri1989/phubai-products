const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entry = {
    pageKey: 'kdsx.production-schedule',
    pageName: 'Ke hoach SX thang',
    pageGroup: 'KINH DOANH',
    path: '/kdsx/production-schedule',
    sortOrder: 50,
  };
  const result = await prisma.pageRegistry.upsert({
    where: { pageKey: entry.pageKey },
    update: entry,
    create: entry,
  });
  console.log('Seeded:', result.pageKey, 'id=', result.id);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
