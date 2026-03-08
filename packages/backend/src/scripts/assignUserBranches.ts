/**
 * One-time script: Assigns all users who have no UserBranch records
 * to ALL branches of their restaurant.
 *
 * Usage: npx tsx src/scripts/assignUserBranches.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all users with their existing branch assignments
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      restaurantId: true,
      branches: { select: { branchId: true } },
    },
  });

  // Get all branches grouped by restaurant
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true, restaurantId: true },
  });

  const branchesByRestaurant = new Map<string, Array<{ id: string; name: string }>>();
  for (const b of branches) {
    const list = branchesByRestaurant.get(b.restaurantId) || [];
    list.push({ id: b.id, name: b.name });
    branchesByRestaurant.set(b.restaurantId, list);
  }

  let totalCreated = 0;

  for (const user of users) {
    if (!user.restaurantId) continue;

    const existingBranchIds = new Set(user.branches.map(b => b.branchId));
    const restaurantBranches = branchesByRestaurant.get(user.restaurantId) || [];

    // Find branches the user is NOT yet assigned to
    const missing = restaurantBranches.filter(b => !existingBranchIds.has(b.id));

    if (missing.length === 0) {
      console.log(`✓ ${user.name || user.username} — already assigned to all branches`);
      continue;
    }

    // Create UserBranch records for missing branches
    const created = await prisma.userBranch.createMany({
      data: missing.map(b => ({ userId: user.id, branchId: b.id })),
      skipDuplicates: true,
    });

    totalCreated += created.count;
    const branchNames = missing.map(b => b.name).join(', ');
    console.log(`+ ${user.name || user.username} — assigned to: ${branchNames} (${created.count} new)`);
  }

  console.log(`\nDone. Created ${totalCreated} UserBranch record(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
