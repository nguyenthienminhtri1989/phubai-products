const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entry = {
    pageKey: 'kdsx.monthly-quotas',
    pageName: 'Phân bổ sản lượng tháng',
    pageGroup: 'KINH DOANH',
    path: '/kdsx/monthly-quotas',
    sortOrder: 35,
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
