/**
 * One-time backfill script:
 * Assigns all existing menu data (categories, menu items, modifier groups)
 * with NULL branchId to the first branch (by createdAt) for each restaurant.
 *
 * Usage: npx tsx src/scripts/backfillMenuBranch.ts
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

    // Update Categories
    const categories = await prisma.category.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Categories updated: ${categories.count}`);

    // Update MenuItems
    const menuItems = await prisma.menuItem.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Menu items updated: ${menuItems.count}`);

    // Update ModifierGroups
    const modifierGroups = await prisma.modifierGroup.updateMany({
      where: { restaurantId, branchId: null },
      data: { branchId },
    });
    console.log(`  Modifier groups updated: ${modifierGroups.count}`);
  }

  console.log('\nBackfill complete!');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
