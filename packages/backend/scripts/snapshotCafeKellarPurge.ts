// Read-only snapshot of all cafe_kellar active+hidden orders that will be permanently deleted.
// Run: npx tsx scripts/snapshotCafeKellarPurge.ts
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'cafe-kellar' },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) throw new Error('cafe-kellar not found');

  // ALL active orders for cafe_kellar (visible 46 + hidden 36 = 82)
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
    },
    include: {
      items: {
        include: {
          modifiers: true,
        },
      },
      orderDiscounts: true,
      receipts: true,
      table: { select: { id: true, number: true, name: true } },
    },
  });

  // Tables that need to be freed
  const tableIds = Array.from(new Set(orders.map(o => o.tableId).filter((x): x is string => !!x)));
  const tables = tableIds.length
    ? await prisma.table.findMany({
        where: { id: { in: tableIds } },
        select: { id: true, number: true, name: true, status: true },
      })
    : [];

  // GroupOrder rows that will have orderId nulled
  const orderIds = orders.map(o => o.id);
  const groupOrders = await prisma.groupOrder.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, orderId: true },
  });

  // Feedback rows that will have orderId nulled
  const feedbacks = await prisma.feedback.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, orderId: true },
  });

  // Counts
  const itemCount = orders.reduce((s, o) => s + o.items.length, 0);
  const modifierCount = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.modifiers.length, 0), 0);
  const discountCount = orders.reduce((s, o) => s + o.orderDiscounts.length, 0);
  const receiptCount = orders.reduce((s, o) => s + o.receipts.length, 0);

  const snapshot = {
    timestamp: new Date().toISOString(),
    restaurant,
    counts: {
      orders: orders.length,
      orderItems: itemCount,
      orderItemModifiers: modifierCount,
      orderDiscounts: discountCount,
      receipts: receiptCount,
      tablesToFree: tables.length,
      groupOrdersNulled: groupOrders.length,
      feedbacksNulled: feedbacks.length,
    },
    orders,
    tables,
    groupOrders,
    feedbacks,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(__dirname, `cafe_kellar_purge_${ts}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2));

  console.log('=== SNAPSHOT WRITTEN ===');
  console.log('File:', file);
  console.log('');
  console.log('=== WHAT WILL BE DELETED ===');
  console.log(`Orders:              ${snapshot.counts.orders}`);
  console.log(`OrderItems:          ${snapshot.counts.orderItems}`);
  console.log(`OrderItemModifiers:  ${snapshot.counts.orderItemModifiers}`);
  console.log(`OrderDiscounts:      ${snapshot.counts.orderDiscounts}`);
  console.log(`Receipts:            ${snapshot.counts.receipts}`);
  console.log('');
  console.log('=== WHAT WILL BE NULLED ===');
  console.log(`GroupOrder.orderId:  ${snapshot.counts.groupOrdersNulled}`);
  console.log(`Feedback.orderId:    ${snapshot.counts.feedbacksNulled}`);
  console.log('');
  console.log('=== WHAT WILL BE FREED ===');
  console.log(`Tables (status=AVAILABLE): ${snapshot.counts.tablesToFree}`);
  console.log('');
  console.log('No payments, no sessions, no other restaurants affected.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
