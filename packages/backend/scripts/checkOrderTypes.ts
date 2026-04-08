import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const r = await p.restaurant.findFirst({ where: { slug: 'cafe-kellar' }, select: { id: true } });
  if (!r) return;

  const active = await p.order.findMany({
    where: { restaurantId: r.id, status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] } },
    select: { id: true, orderType: true, status: true },
  });

  const byType: Record<string, number> = {};
  for (const o of active) byType[o.orderType] = (byType[o.orderType] || 0) + 1;

  console.log('=== 82 Active Orders by orderType ===');
  console.log(`QSR (from QSR board):              ${byType['QSR'] || 0}`);
  console.log(`QSR_TAKEAWAY (from QSR board):     ${byType['QSR_TAKEAWAY'] || 0}`);
  console.log(`DINE_IN (from Create Order):        ${byType['DINE_IN'] || 0}`);
  console.log(`TAKEAWAY (from Create Order):       ${byType['TAKEAWAY'] || 0}`);
  console.log(`Total:                              ${active.length}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
