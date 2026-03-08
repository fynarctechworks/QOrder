import { prisma } from '../lib';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Seeds realistic inventory data for Lotus Cafe.
 *  - 5 suppliers
 *  - 22 ingredients (vegetables, dairy, spices, grains, protein)
 *  - Stock movements over the last 7 days
 *  - A couple of purchase orders
 */

async function main() {
  // Find a branch that has a restaurant, and use that pair
  const branch = await prisma.branch.findFirst({ include: { restaurant: true } });
  if (!branch) throw new Error('No branch found');
  const restaurant = branch.restaurant;

  const rid = restaurant.id;
  const bid = branch.id;

  console.log(`Seeding inventory for "${restaurant.name}" / "${branch.name}"...\n`);

  // ── Clean previous inventory data (order matters for FK) ──
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { restaurantId: rid } } });
  await prisma.purchaseOrder.deleteMany({ where: { restaurantId: rid } });
  await prisma.stockMovement.deleteMany({ where: { restaurantId: rid } });
  await prisma.ingredientSupplier.deleteMany({ where: { ingredient: { restaurantId: rid } } });
  await prisma.recipe.deleteMany({ where: { ingredient: { restaurantId: rid } } });
  await prisma.ingredient.deleteMany({ where: { restaurantId: rid } });
  await prisma.supplier.deleteMany({ where: { restaurantId: rid } });
  console.log('  ✓ Cleaned old inventory data');

  // ── Suppliers ──
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        name: 'Sri Krishna Vegetables',
        contactName: 'Ramesh Kumar',
        phone: '9876543210',
        email: 'krishnaveg@example.com',
        address: '12, Koyambedu Market, Chennai',
        restaurantId: rid,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Mehta Dairy Farm',
        contactName: 'Suresh Mehta',
        phone: '9123456789',
        email: 'mehtadairy@example.com',
        address: '45, Dairy Road, Ennore',
        restaurantId: rid,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Royal Spice Traders',
        contactName: 'Ahmed Khan',
        phone: '9988776655',
        email: 'royalspice@example.com',
        address: '8, Spice Bazaar, George Town',
        restaurantId: rid,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Hindustan Grocery',
        contactName: 'Vijay Sharma',
        phone: '9556677889',
        address: '22, Main Road, T. Nagar',
        restaurantId: rid,
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Fresh Catch Seafood',
        contactName: 'Mani Rajan',
        phone: '9445566778',
        address: 'Kasimedu Fishing Harbor',
        restaurantId: rid,
      },
    }),
  ]);

  const [vegSupplier, dairySupplier, spiceSupplier, grocerySupplier, seafoodSupplier] = suppliers;
  console.log(`  ✓ Created ${suppliers.length} suppliers`);

  // ── Ingredients ──
  // Helper to create ingredient + link supplier
  async function createIng(
    name: string,
    unit: string,
    currentStock: number,
    minStock: number,
    costPerUnit: number,
    supplierId: string,
  ) {
    const ing = await prisma.ingredient.create({
      data: {
        name,
        unit: unit as any,
        currentStock,
        minStock,
        costPerUnit,
        restaurantId: rid,
        branchId: bid,
      },
    });
    await prisma.ingredientSupplier.create({
      data: {
        ingredientId: ing.id,
        supplierId,
        costPerUnit,
        isPreferred: true,
      },
    });
    return ing;
  }

  // Vegetables
  const onion     = await createIng('Onion', 'KG', 25, 10, 40, vegSupplier.id);
  const tomato    = await createIng('Tomato', 'KG', 18, 8, 35, vegSupplier.id);
  const potato    = await createIng('Potato', 'KG', 30, 10, 30, vegSupplier.id);
  const greenChili = await createIng('Green Chili', 'KG', 3, 2, 80, vegSupplier.id);
  const ginger    = await createIng('Ginger', 'KG', 4, 2, 120, vegSupplier.id);
  const garlic    = await createIng('Garlic', 'KG', 5, 2, 100, vegSupplier.id);
  const capsicum  = await createIng('Capsicum', 'KG', 6, 3, 60, vegSupplier.id);
  const mushroom  = await createIng('Mushroom', 'KG', 2, 3, 150, vegSupplier.id);   // ← LOW
  const coriander = await createIng('Fresh Coriander', 'BUNCH', 8, 5, 10, vegSupplier.id);

  // Dairy
  const paneer    = await createIng('Paneer', 'KG', 8, 3, 320, dairySupplier.id);
  const milk      = await createIng('Milk', 'L', 15, 10, 60, dairySupplier.id);
  const butter    = await createIng('Butter', 'KG', 4, 2, 480, dairySupplier.id);
  const cream     = await createIng('Fresh Cream', 'L', 3, 2, 200, dairySupplier.id);
  const cheese    = await createIng('Cheese', 'KG', 1.5, 2, 450, dairySupplier.id); // ← LOW

  // Spices & Dry goods
  const garamMasala = await createIng('Garam Masala', 'KG', 2, 1, 600, spiceSupplier.id);
  const turmeric  = await createIng('Turmeric Powder', 'KG', 3, 1, 200, spiceSupplier.id);
  const chiliPowder = await createIng('Red Chili Powder', 'KG', 2.5, 1, 300, spiceSupplier.id);
  const salt      = await createIng('Salt', 'KG', 10, 5, 20, grocerySupplier.id);

  // Grains & Oils
  const rice      = await createIng('Basmati Rice', 'KG', 40, 15, 120, grocerySupplier.id);
  const oil       = await createIng('Cooking Oil', 'L', 20, 10, 140, grocerySupplier.id);
  const flour     = await createIng('Wheat Flour (Atta)', 'KG', 25, 10, 45, grocerySupplier.id);
  const sugar     = await createIng('Sugar', 'KG', 12, 5, 42, grocerySupplier.id);

  // Protein
  const chicken   = await createIng('Chicken', 'KG', 10, 5, 220, grocerySupplier.id);
  const eggs      = await createIng('Eggs', 'DOZEN', 5, 3, 72, grocerySupplier.id);

  const allIngs = [
    onion, tomato, potato, greenChili, ginger, garlic, capsicum, mushroom, coriander,
    paneer, milk, butter, cream, cheese,
    garamMasala, turmeric, chiliPowder, salt,
    rice, oil, flour, sugar,
    chicken, eggs,
  ];
  console.log(`  ✓ Created ${allIngs.length} ingredients with supplier links`);

  // ── Stock Movements (last 7 days) ──
  const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  const movementData: {
    type: string;
    ingredientId: string;
    quantity: number;
    previousQty: number;
    newQty: number;
    costPerUnit?: number;
    notes?: string;
    createdAt: Date;
  }[] = [
    // Day 7 — big purchase
    { type: 'PURCHASE', ingredientId: onion.id, quantity: 20, previousQty: 5, newQty: 25, costPerUnit: 40, notes: 'Weekly restock', createdAt: day(7) },
    { type: 'PURCHASE', ingredientId: tomato.id, quantity: 15, previousQty: 3, newQty: 18, costPerUnit: 35, notes: 'Weekly restock', createdAt: day(7) },
    { type: 'PURCHASE', ingredientId: rice.id, quantity: 25, previousQty: 15, newQty: 40, costPerUnit: 120, notes: 'Bulk order', createdAt: day(7) },
    { type: 'PURCHASE', ingredientId: oil.id, quantity: 15, previousQty: 5, newQty: 20, costPerUnit: 140, notes: 'Monthly supply', createdAt: day(7) },
    // Day 6 — kitchen usage
    { type: 'USAGE', ingredientId: onion.id, quantity: 3, previousQty: 25, newQty: 22, notes: 'Lunch prep', createdAt: day(6) },
    { type: 'USAGE', ingredientId: tomato.id, quantity: 2, previousQty: 18, newQty: 16, notes: 'Gravy base', createdAt: day(6) },
    { type: 'USAGE', ingredientId: chicken.id, quantity: 4, previousQty: 14, newQty: 10, notes: 'Chicken dishes', createdAt: day(6) },
    // Day 5 — dairy delivery
    { type: 'PURCHASE', ingredientId: paneer.id, quantity: 5, previousQty: 3, newQty: 8, costPerUnit: 320, notes: 'Dairy delivery', createdAt: day(5) },
    { type: 'PURCHASE', ingredientId: milk.id, quantity: 10, previousQty: 5, newQty: 15, costPerUnit: 60, notes: 'Dairy delivery', createdAt: day(5) },
    { type: 'PURCHASE', ingredientId: butter.id, quantity: 3, previousQty: 1, newQty: 4, costPerUnit: 480, notes: 'Dairy delivery', createdAt: day(5) },
    // Day 4 — usage
    { type: 'USAGE', ingredientId: rice.id, quantity: 5, previousQty: 40, newQty: 35, notes: 'Biryani prep', createdAt: day(4) },
    { type: 'USAGE', ingredientId: paneer.id, quantity: 2, previousQty: 8, newQty: 6, notes: 'Paneer dishes', createdAt: day(4) },
    { type: 'USAGE', ingredientId: oil.id, quantity: 3, previousQty: 20, newQty: 17, notes: 'Deep frying', createdAt: day(4) },
    // Day 3 — waste + usage
    { type: 'WASTE', ingredientId: tomato.id, quantity: 1, previousQty: 16, newQty: 15, notes: 'Spoiled batch', createdAt: day(3) },
    { type: 'USAGE', ingredientId: flour.id, quantity: 4, previousQty: 25, newQty: 21, notes: 'Naan + Roti', createdAt: day(3) },
    { type: 'USAGE', ingredientId: eggs.id, quantity: 2, previousQty: 7, newQty: 5, notes: 'Egg curry + omelettes', createdAt: day(3) },
    // Day 2 — restock some items
    { type: 'PURCHASE', ingredientId: chicken.id, quantity: 6, previousQty: 10, newQty: 16, costPerUnit: 220, notes: 'Morning delivery', createdAt: day(2) },
    { type: 'USAGE', ingredientId: garamMasala.id, quantity: 0.5, previousQty: 2.5, newQty: 2, notes: 'Spice mix', createdAt: day(2) },
    { type: 'USAGE', ingredientId: cream.id, quantity: 1, previousQty: 4, newQty: 3, notes: 'Butter chicken', createdAt: day(2) },
    // Day 1 — yesterday
    { type: 'USAGE', ingredientId: onion.id, quantity: 4, previousQty: 22, newQty: 18, notes: 'Dinner service', createdAt: day(1) },
    { type: 'USAGE', ingredientId: chicken.id, quantity: 6, previousQty: 16, newQty: 10, notes: 'Dinner service', createdAt: day(1) },
    { type: 'USAGE', ingredientId: rice.id, quantity: 5, previousQty: 35, newQty: 30, notes: 'Biryani + fried rice', createdAt: day(1) },
    { type: 'MANUAL_ADD', ingredientId: coriander.id, quantity: 5, previousQty: 3, newQty: 8, notes: 'Staff brought extra', createdAt: day(1) },
    // Day 0 — today
    { type: 'USAGE', ingredientId: tomato.id, quantity: 3, previousQty: 15, newQty: 12, notes: 'Lunch prep', createdAt: day(0) },
    { type: 'USAGE', ingredientId: potato.id, quantity: 2, previousQty: 30, newQty: 28, notes: 'Aloo gobi', createdAt: day(0) },
  ];

  await prisma.stockMovement.createMany({
    data: movementData.map(m => ({
      type: m.type as any,
      ingredientId: m.ingredientId,
      quantity: m.quantity,
      previousQty: m.previousQty,
      newQty: m.newQty,
      costPerUnit: m.costPerUnit ?? null,
      notes: m.notes,
      createdAt: m.createdAt,
      restaurantId: rid,
    })),
  });
  console.log(`  ✓ Created ${movementData.length} stock movements`);

  // ── Purchase Orders ──
  // PO-001 — received 5 days ago (dairy delivery)
  await prisma.purchaseOrder.create({
    data: {
      orderNumber: 'PO-001',
      status: 'RECEIVED',
      totalAmount: 5480,
      notes: 'Weekly dairy restock',
      orderedAt: day(6),
      receivedAt: day(5),
      restaurantId: rid,
      branchId: bid,
      supplierId: dairySupplier.id,
      items: {
        create: [
          { ingredientId: paneer.id, quantity: 5, costPerUnit: 320, totalCost: 1600 },
          { ingredientId: milk.id, quantity: 10, costPerUnit: 60, totalCost: 600 },
          { ingredientId: butter.id, quantity: 3, costPerUnit: 480, totalCost: 1440 },
          { ingredientId: cream.id, quantity: 4, costPerUnit: 200, totalCost: 800 },
          { ingredientId: cheese.id, quantity: 2, costPerUnit: 450, totalCost: 900 },
          { ingredientId: eggs.id, quantity: 2, costPerUnit: 72, totalCost: 144 },
        ],
      },
    },
  });

  // PO-002 — ordered, not yet received (vegetable restock)
  await prisma.purchaseOrder.create({
    data: {
      orderNumber: 'PO-002',
      status: 'ORDERED',
      totalAmount: 2950,
      notes: 'Urgent vegetable restock — running low on mushrooms',
      orderedAt: day(1),
      restaurantId: rid,
      branchId: bid,
      supplierId: vegSupplier.id,
      items: {
        create: [
          { ingredientId: mushroom.id, quantity: 5, costPerUnit: 150, totalCost: 750 },
          { ingredientId: capsicum.id, quantity: 5, costPerUnit: 60, totalCost: 300 },
          { ingredientId: tomato.id, quantity: 20, costPerUnit: 35, totalCost: 700 },
          { ingredientId: onion.id, quantity: 15, costPerUnit: 40, totalCost: 600 },
          { ingredientId: greenChili.id, quantity: 3, costPerUnit: 80, totalCost: 240 },
          { ingredientId: ginger.id, quantity: 3, costPerUnit: 120, totalCost: 360 },
        ],
      },
    },
  });

  // PO-003 — draft (spices/grocery)
  await prisma.purchaseOrder.create({
    data: {
      orderNumber: 'PO-003',
      status: 'DRAFT',
      totalAmount: 4050,
      notes: 'Monthly spice & staples order',
      restaurantId: rid,
      branchId: bid,
      supplierId: spiceSupplier.id,
      items: {
        create: [
          { ingredientId: garamMasala.id, quantity: 2, costPerUnit: 600, totalCost: 1200 },
          { ingredientId: turmeric.id, quantity: 3, costPerUnit: 200, totalCost: 600 },
          { ingredientId: chiliPowder.id, quantity: 3, costPerUnit: 300, totalCost: 900 },
          { ingredientId: rice.id, quantity: 10, costPerUnit: 120, totalCost: 1200 },
          { ingredientId: salt.id, quantity: 5, costPerUnit: 20, totalCost: 100 },
          { ingredientId: sugar.id, quantity: 2, costPerUnit: 25, totalCost: 50 },
        ],
      },
    },
  });
  console.log('  ✓ Created 3 purchase orders');

  // ── Update a few stock levels to match the movement trail ──
  // mushroom and cheese are intentionally LOW to trigger alerts
  await prisma.ingredient.update({ where: { id: mushroom.id }, data: { currentStock: 2 } });
  await prisma.ingredient.update({ where: { id: cheese.id }, data: { currentStock: 1.5 } });
  await prisma.ingredient.update({ where: { id: onion.id }, data: { currentStock: 18 } });
  await prisma.ingredient.update({ where: { id: tomato.id }, data: { currentStock: 12 } });
  await prisma.ingredient.update({ where: { id: rice.id }, data: { currentStock: 30 } });
  await prisma.ingredient.update({ where: { id: chicken.id }, data: { currentStock: 10 } });

  console.log('  ✓ Updated stock levels for movement consistency');

  // ── Summary ──
  const total = allIngs.length;
  const lowCount = allIngs.filter(i => {
    const stock = Number(i.currentStock);
    const min = Number(i.minStock);
    return stock <= min;
  }).length;
  console.log(`\n✅ Inventory seeded successfully!`);
  console.log(`   ${suppliers.length} suppliers · ${total} products · ${movementData.length} movements · 3 POs`);
  console.log(`   ${lowCount} items below min stock (before updates)`);
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
