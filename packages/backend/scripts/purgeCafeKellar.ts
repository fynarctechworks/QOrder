// PERMANENT DELETE: cafe_kellar 82 active orders + free 22 tables.
// Authorized by user. Snapshot exists at cafe_kellar_purge_2026-04-07T21-49-19-068Z.json
// Run: npx tsx scripts/purgeCafeKellar.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'cafe-kellar' },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) throw new Error('cafe-kellar not found');
  console.log('Restaurant:', restaurant);

  const orders = await prisma.order.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
    },
    select: { id: true, tableId: true },
  });

  const orderIds = orders.map(o => o.id);
  const tableIds = Array.from(new Set(orders.map(o => o.tableId).filter((x): x is string => !!x)));

  console.log(`About to delete ${orderIds.length} orders and free ${tableIds.length} tables.`);

  const result = await prisma.$transaction([
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.table.updateMany({
      where: { id: { in: tableIds }, restaurantId: restaurant.id },
      data: { status: 'AVAILABLE' },
    }),
  ]);

  console.log('=== DONE ===');
  console.log(`Orders deleted:    ${result[0].count}`);
  console.log(`Tables freed:      ${result[1].count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
