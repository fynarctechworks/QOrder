import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const r = await p.restaurant.findFirst({ where: { slug: 'cafe-kellar' }, select: { id: true } });
  if (!r) throw new Error('not found');

  const order = await p.order.findFirst({
    where: { restaurantId: r.id, tokenNumber: 86, status: 'CANCELLED' },
    select: { id: true, tokenNumber: true, status: true, total: true },
  });
  if (!order) { console.log('Order not found'); return; }
  console.log('Found:', order);

  const updated = await p.order.update({
    where: { id: order.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  console.log('Updated: status =', updated.status, 'tokenNumber =', updated.tokenNumber);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
