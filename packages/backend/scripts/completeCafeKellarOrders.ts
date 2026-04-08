// Mark all 82 active cafe_kellar orders as COMPLETED and free tables.
// Run: npx tsx scripts/completeCafeKellarOrders.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'cafe-kellar' },
    select: { id: true, name: true },
  });
  if (!restaurant) throw new Error('cafe-kellar not found');

  const orders = await prisma.order.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
    },
    select: { id: true, tableId: true, status: true },
  });

  const orderIds = orders.map(o => o.id);
  const tableIds = Array.from(new Set(orders.map(o => o.tableId).filter((x): x is string => !!x)));

  console.log(`Orders to complete: ${orderIds.length}`);
  console.log(`Tables to free: ${tableIds.length}`);

  const now = new Date();
  const result = await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: 'COMPLETED', completedAt: now, updatedAt: now },
    }),
    prisma.table.updateMany({
      where: { id: { in: tableIds }, restaurantId: restaurant.id },
      data: { status: 'AVAILABLE' },
    }),
  ]);

  console.log('=== DONE ===');
  console.log(`Orders completed:  ${result[0].count}`);
  console.log(`Tables freed:      ${result[1].count}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
