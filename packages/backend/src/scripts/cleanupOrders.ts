/**
 * One-time script: Removes all order-related data for a specific user's restaurant.
 * Menu, categories, modifiers, and other config remain untouched.
 *
 * Usage: npx tsx src/scripts/cleanupOrders.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_USERNAME = 'cafe_kellar';

async function main() {
  // Step 0: Find the user and their restaurantId
  const user = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
    select: { id: true, name: true, username: true, restaurantId: true, restaurant: { select: { name: true } } },
  });

  if (!user) {
    console.error(`User "${TARGET_USERNAME}" not found.`);
    process.exit(1);
  }

  const rid = user.restaurantId;
  console.log(`Found user: ${user.name} (${user.username})`);
  console.log(`Restaurant: ${user.restaurant.name} (${rid})`);

  // Count existing records before deletion
  const counts = {
    orders: await prisma.order.count({ where: { restaurantId: rid } }),
    orderItems: await prisma.orderItem.count({ where: { order: { restaurantId: rid } } }),
    payments: await prisma.payment.count({ where: { restaurantId: rid } }),
    tableSessions: await prisma.tableSession.count({ where: { restaurantId: rid } }),
    feedback: await prisma.feedback.count({ where: { restaurantId: rid } }),
    groupOrders: await prisma.groupOrder.count({ where: { restaurantId: rid } }),
    receipts: await prisma.receipt.count({ where: { order: { restaurantId: rid } } }),
    orderDiscounts: await prisma.orderDiscount.count({ where: { order: { restaurantId: rid } } }),
    creditTransactions: await prisma.creditTransaction.count({ where: { restaurantId: rid } }),
    serviceRequests: await prisma.serviceRequest.count({ where: { restaurantId: rid } }),
  };

  console.log('\n--- Records to delete ---');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('\nNo order-related data found. Nothing to delete.');
    return;
  }

  console.log(`\nTotal records to remove: ${total}`);
  console.log('Executing cleanup in a single transaction...\n');

  // Execute all deletes in a single transaction
  const result = await prisma.$transaction([
    // 1. Feedback (SET NULL on order delete would orphan these)
    prisma.feedback.deleteMany({ where: { restaurantId: rid } }),
    // 2. GroupOrders (cascades to GroupParticipant → GroupCartItem)
    prisma.groupOrder.deleteMany({ where: { restaurantId: rid } }),
    // 3. Orders (cascades to OrderItem → OrderItemModifier, OrderDiscount, Receipt)
    prisma.order.deleteMany({ where: { restaurantId: rid } }),
    // 4. Payments (linked to sessions, not orders)
    prisma.payment.deleteMany({ where: { restaurantId: rid } }),
    // 5. TableSessions
    prisma.tableSession.deleteMany({ where: { restaurantId: rid } }),
    // 6. CreditTransactions
    prisma.creditTransaction.deleteMany({ where: { restaurantId: rid } }),
    // 7. ServiceRequests
    prisma.serviceRequest.deleteMany({ where: { restaurantId: rid } }),
  ]);

  const labels = [
    'Feedback', 'GroupOrders', 'Orders', 'Payments',
    'TableSessions', 'CreditTransactions', 'ServiceRequests',
  ];

  console.log('--- Deletion results ---');
  result.forEach((r, i) => {
    console.log(`  ${labels[i]}: ${r.count} deleted`);
  });

  // Verify menu is intact
  const menuCount = await prisma.menuItem.count({ where: { restaurantId: rid } });
  const categoryCount = await prisma.category.count({ where: { restaurantId: rid } });
  console.log(`\n--- Menu verification (untouched) ---`);
  console.log(`  Menu items: ${menuCount}`);
  console.log(`  Categories: ${categoryCount}`);
  console.log('\nDone! All order data removed. Menu remains intact.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
