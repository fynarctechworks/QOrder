// RESTORE: re-create the 82 cafe_kellar orders + items + modifiers from snapshot,
// and put the 22 tables back to their prior status.
// Run: npx tsx scripts/restoreCafeKellar.ts
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const SNAPSHOT_FILE = 'cafe_kellar_purge_2026-04-07T21-49-19-068Z.json';

async function main() {
  const raw = readFileSync(join(__dirname, SNAPSHOT_FILE), 'utf8');
  const snap = JSON.parse(raw);
  const orders: any[] = snap.orders;
  const tables: any[] = snap.tables;

  console.log(`Snapshot orders: ${orders.length}, tables: ${tables.length}`);

  // Check what's already there to avoid duplicate-key errors on re-runs.
  const existing = await prisma.order.findMany({
    where: { id: { in: orders.map(o => o.id) } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map(e => e.id));
  const toCreate = orders.filter(o => !existingIds.has(o.id));
  console.log(`Already present: ${existingIds.size}. Will create: ${toCreate.length}`);

  let createdOrders = 0;
  let createdItems = 0;
  let createdMods = 0;

  for (const o of toCreate) {
    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: o.id,
          orderNumber: o.orderNumber,
          tokenNumber: o.tokenNumber,
          tentNumber: o.tentNumber,
          status: o.status,
          orderType: o.orderType,
          subtotal: o.subtotal,
          discount: o.discount,
          tax: o.tax,
          total: o.total,
          notes: o.notes,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          estimatedTime: o.estimatedTime,
          preparedAt: o.preparedAt ? new Date(o.preparedAt) : null,
          completedAt: o.completedAt ? new Date(o.completedAt) : null,
          gatewayOrderId: o.gatewayOrderId,
          isPaid: o.isPaid,
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt),
          restaurantId: o.restaurantId,
          branchId: o.branchId,
          tableId: o.tableId,
          sessionId: o.sessionId,
        },
      });
      createdOrders++;

      for (const it of o.items) {
        await tx.orderItem.create({
          data: {
            id: it.id,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            notes: it.notes,
            preparedAt: it.preparedAt ? new Date(it.preparedAt) : null,
            itemSnapshot: it.itemSnapshot ?? undefined,
            orderId: it.orderId,
            menuItemId: it.menuItemId,
          },
        });
        createdItems++;

        for (const m of it.modifiers) {
          await tx.orderItemModifier.create({
            data: {
              id: m.id,
              name: m.name,
              price: m.price,
              orderItemId: m.orderItemId,
              modifierId: m.modifierId,
            },
          });
          createdMods++;
        }
      }
    });
  }

  // Restore table statuses
  let tableUpdates = 0;
  for (const t of tables) {
    await prisma.table.update({
      where: { id: t.id },
      data: { status: t.status },
    });
    tableUpdates++;
  }

  console.log('=== RESTORE DONE ===');
  console.log(`Orders created:      ${createdOrders}`);
  console.log(`OrderItems created:  ${createdItems}`);
  console.log(`Modifiers created:   ${createdMods}`);
  console.log(`Tables restored:     ${tableUpdates}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
