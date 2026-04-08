import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const r = await p.restaurant.findFirst({ where: { slug: 'cafe-kellar' }, select: { id: true } });
  if (!r) { console.log('not found'); return; }

  const all = await p.order.findMany({
    where: { restaurantId: r.id },
    select: { id: true, orderType: true, status: true, sessionId: true, customerName: true, customerPhone: true, tableId: true, createdAt: true, tokenNumber: true },
    orderBy: { createdAt: 'desc' },
  });

  const noSession = all.filter(o => !o.sessionId);
  const withSession = all.filter(o => o.sessionId);

  console.log('Total orders:', all.length);
  console.log('With sessionId (QSR/customer placed):', withSession.length);
  console.log('Without sessionId (likely Create Order):', noSession.length);

  const byStatus: Record<string, number> = {};
  for (const o of noSession) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  console.log('\nNo-session by status:', byStatus);

  const byType: Record<string, number> = {};
  for (const o of noSession) byType[o.orderType] = (byType[o.orderType] || 0) + 1;
  console.log('No-session by orderType:', byType);

  // The 82 restored orders
  const active82 = all.filter(o => ['PENDING', 'PREPARING', 'PAYMENT_PENDING'].includes(o.status));
  const active82NoSession = active82.filter(o => !o.sessionId);
  console.log('\nActive (PENDING/PREPARING/PAYMENT_PENDING):', active82.length);
  console.log('Active without sessionId:', active82NoSession.length);
  console.log('Active with sessionId:', active82.length - active82NoSession.length);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
