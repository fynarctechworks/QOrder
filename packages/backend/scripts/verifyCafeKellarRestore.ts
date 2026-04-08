// Verify that every order in the snapshot is now present in the DB,
// and that items + modifiers + totals match.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const SNAPSHOT_FILE = 'cafe_kellar_purge_2026-04-07T21-49-19-068Z.json';

async function main() {
  const snap = JSON.parse(readFileSync(join(__dirname, SNAPSHOT_FILE), 'utf8'));
  const snapOrders: any[] = snap.orders;
  const snapIds = snapOrders.map(o => o.id);

  const dbOrders = await prisma.order.findMany({
    where: { id: { in: snapIds } },
    include: { items: { include: { modifiers: true } } },
  });
  const dbById = new Map(dbOrders.map(o => [o.id, o]));

  const missing: string[] = [];
  const itemMismatch: any[] = [];
  const modMismatch: any[] = [];
  const totalMismatch: any[] = [];
  let snapTotal = 0;
  let dbTotal = 0;

  for (const so of snapOrders) {
    snapTotal += Number(so.total);
    const db = dbById.get(so.id);
    if (!db) { missing.push(so.id); continue; }
    dbTotal += Number(db.total);
    if (db.items.length !== so.items.length) {
      itemMismatch.push({ id: so.id, snap: so.items.length, db: db.items.length });
    }
    const snapMods = so.items.reduce((s: number, i: any) => s + i.modifiers.length, 0);
    const dbMods = db.items.reduce((s, i) => s + i.modifiers.length, 0);
    if (snapMods !== dbMods) modMismatch.push({ id: so.id, snap: snapMods, db: dbMods });
    if (Number(so.total) !== Number(db.total)) totalMismatch.push({ id: so.id, snap: so.total, db: db.total });
  }

  // Also: how many cafe_kellar active orders exist NOW vs snapshot
  const restaurant = await prisma.restaurant.findFirst({ where: { slug: 'cafe-kellar' }, select: { id: true } });
  const liveCount = await prisma.order.count({
    where: {
      restaurantId: restaurant!.id,
      status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
    },
  });
  const liveSum = await prisma.order.aggregate({
    where: {
      restaurantId: restaurant!.id,
      status: { in: ['PENDING', 'PREPARING', 'PAYMENT_PENDING'] },
    },
    _sum: { total: true },
  });

  console.log('=== SNAPSHOT vs DB ===');
  console.log(`Snapshot orders:           ${snapOrders.length}`);
  console.log(`DB rows matching snap ids: ${dbOrders.length}`);
  console.log(`Missing from DB:           ${missing.length}`);
  if (missing.length) console.log('Missing IDs:', missing);
  console.log(`Item count mismatches:     ${itemMismatch.length}`);
  if (itemMismatch.length) console.log(itemMismatch);
  console.log(`Modifier count mismatches: ${modMismatch.length}`);
  if (modMismatch.length) console.log(modMismatch);
  console.log(`Total amount mismatches:   ${totalMismatch.length}`);
  if (totalMismatch.length) console.log(totalMismatch);
  console.log(`Snapshot sum of totals:    ₹${snapTotal.toFixed(2)}`);
  console.log(`DB sum of restored totals: ₹${dbTotal.toFixed(2)}`);
  console.log('');
  console.log('=== LIVE cafe_kellar active orders (PENDING/PREPARING/PAYMENT_PENDING) ===');
  console.log(`Count:  ${liveCount}`);
  console.log(`Sum:    ₹${Number(liveSum._sum.total ?? 0).toFixed(2)}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
