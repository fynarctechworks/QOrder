// Read-only: list all running-table orders for cafe_kellar.
// Run: npx tsx scripts/listCafeKellarRunning.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: 'cafe_kellar' }, { slug: 'cafe-kellar' }, { name: { contains: 'kellar', mode: 'insensitive' } }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.log('No restaurant found for cafe_kellar');
    return;
  }
  console.log('Restaurant:', restaurant);

  const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] as const;

  // Mirror the Orders page exactly: fetch top 500 most recent, then filter to active statuses.
  const recent = await prisma.order.findMany({
    where: { restaurantId: restaurant.id },
    select: {
      id: true,
      status: true,
      orderType: true,
      total: true,
      createdAt: true,
      tableId: true,
      sessionId: true,
      table: { select: { number: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const orders = recent.filter(o => (ACTIVE_STATUSES as readonly string[]).includes(o.status));

  // Group by table
  const byTable = new Map<string, typeof orders>();
  for (const o of orders) {
    const k = o.table?.number ?? 'NO-TABLE';
    if (!byTable.has(k)) byTable.set(k, [] as any);
    byTable.get(k)!.push(o);
  }

  let totalAmount = 0;
  for (const [t, os] of byTable) {
    const sub = os.reduce((s, o) => s + Number(o.total), 0);
    totalAmount += sub;
    console.log(`\nTable ${t}  orders=${os.length}  total=₹${sub.toFixed(2)}`);
    for (const o of os) {
      console.log(`  order=${o.id.slice(0, 8)} status=${o.status} total=₹${o.total} items=${o._count.items} session=${o.sessionId?.slice(0,8) ?? '-'} createdAt=${o.createdAt.toISOString()}`);
    }
  }

  // Sessions referenced
  const sessionIds = Array.from(new Set(orders.map(o => o.sessionId).filter(Boolean) as string[]));
  const sessions = sessionIds.length ? await prisma.tableSession.findMany({
    where: { id: { in: sessionIds } },
    select: { id: true, status: true, tableId: true, startedAt: true },
  }) : [];

  // Payments tied to those sessions
  const payments = sessionIds.length ? await prisma.payment.findMany({
    where: { sessionId: { in: sessionIds } },
    select: { id: true, status: true, amount: true, method: true, sessionId: true },
  }) : [];

  // Count by orderType
  const byType = new Map<string, number>();
  for (const o of orders) byType.set(o.orderType, (byType.get(o.orderType) ?? 0) + 1);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Tables:    ${byTable.size}`);
  console.log(`Orders:    ${orders.length}`);
  console.log(`By type:   ${Array.from(byType.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`Sessions:  ${sessions.length} (${sessions.map(s => s.status).join(', ')})`);
  console.log(`Payments:  ${payments.length}`);
  if (payments.length) {
    for (const p of payments) console.log(`  payment=${p.id.slice(0, 8)} status=${p.status} amount=₹${p.amount} method=${p.method}`);
  }
  console.log(`Amount:    ₹${totalAmount.toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
