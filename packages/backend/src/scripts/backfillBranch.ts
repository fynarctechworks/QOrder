/**
 * One-time backfill script:
 * Assigns all existing data (tables, sections, orders, sessions, payments)
 * with NULL branchId to the first branch (by createdAt) for each restaurant.
 *
 * Usage: npx tsx src/scripts/backfillBranch.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the oldest branch per restaurant (Branch 1)
  const branches = await prisma.branch.findMany({
    orderBy: { createdAt: 'asc' },
  });

  // Group by restaurant — pick the first (oldest) branch per restaurant
  const restaurantBranchMap = new Map<string, string>();
  for (const b of branches) {
    if (!restaurantBranchMap.has(b.restaurantId)) {
      restaurantBranchMap.set(b.restaurantId, b.id);
    }
  }

  console.log(`Found ${restaurantBranchMap.size} restaurant(s) with branches.`);

  for (const [restaurantId, branchId] of restaurantBranchMap) {
    console.log(`\nRestaurant ${restaurantId} → Branch ${branchId}`);

    // Update Tables
    const tables = await prisma.table.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Tables updated: ${tables.count}`);

    // Update Sections
    const sections = await prisma.section.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Sections updated: ${sections.count}`);

    // Update Orders
    const orders = await prisma.order.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Orders updated: ${orders.count}`);

    // Update TableSessions
    const sessions = await prisma.tableSession.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Sessions updated: ${sessions.count}`);

    // Update Payments
    const payments = await prisma.payment.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Payments updated: ${payments.count}`);
  }

  console.log('\n✅ Backfill complete!');
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
