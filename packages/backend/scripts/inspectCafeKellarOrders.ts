import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const r = await p.restaurant.findFirst({ where: { slug: 'cafe-kellar' }, select: { id: true } });
  if (!r) { console.log('not found'); return; }

  const recent = await p.order.findMany({
    where: { restaurantId: r.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const active = recent.filter((o: any) => ['PENDING','PREPARING','PAYMENT_PENDING'].includes(o.status));

  console.log('Sample order keys:', Object.keys(active[0] ?? {}));
  console.log('\nSample order full:');
  console.log(JSON.stringify(active[0], null, 2));

  const withSession = active.filter((o: any) => o.sessionId).length;
  const withCustomerName = active.filter((o: any) => o.customerName && o.customerName.trim()).length;
  const withCustomerPhone = active.filter((o: any) => o.customerPhone && o.customerPhone.trim()).length;
  const withTable = active.filter((o: any) => o.tableId).length;
  console.log('\n--- STATS for visible-46 active ---');
  console.log('Total active:', active.length);
  console.log('With sessionId:', withSession);
  console.log('With customerName:', withCustomerName);
  console.log('With customerPhone:', withCustomerPhone);
  console.log('With tableId:', withTable);

  // Hidden 36
  const all = await p.order.findMany({
    where: { restaurantId: r.id, status: { in: ['PENDING','PREPARING','PAYMENT_PENDING'] } },
    orderBy: { createdAt: 'desc' },
  });
  const hidden = all.slice(active.length); // older ones not in top 500 of recent
  // Better: those not in active set
  const activeIds = new Set(active.map((o: any) => o.id));
  const hiddenSet = all.filter((o: any) => !activeIds.has(o.id));
  console.log('\n--- Hidden orders ---');
  console.log('Count:', hiddenSet.length);
  if (hiddenSet[0]) {
    console.log('Sample hidden:');
    console.log(JSON.stringify(hiddenSet[0], null, 2));
  }
  const hWithSession = hiddenSet.filter((o: any) => o.sessionId).length;
  const hWithCustomerName = hiddenSet.filter((o: any) => o.customerName && o.customerName.trim()).length;
  const hWithCustomerPhone = hiddenSet.filter((o: any) => o.customerPhone && o.customerPhone.trim()).length;
  const hWithTable = hiddenSet.filter((o: any) => o.tableId).length;
  console.log('Hidden with sessionId:', hWithSession);
  console.log('Hidden with customerName:', hWithCustomerName);
  console.log('Hidden with customerPhone:', hWithCustomerPhone);
  console.log('Hidden with tableId:', hWithTable);

  await p.$disconnect();
})();
