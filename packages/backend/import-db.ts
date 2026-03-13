/**
 * Improved Database Import Script
 * Uses Prisma's createMany for proper type handling (arrays, JSON, enums, decimals)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const BACKUP_FILE = path.join(__dirname, '..', '..', 'db_backup', 'migration_data.json');

async function importData(targetUrl?: string) {
  console.log('=== IMPORTING DATA INTO TARGET DATABASE ===');

  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`Backup file not found: ${BACKUP_FILE}`);
    process.exit(1);
  }

  if (targetUrl) {
    process.env.DATABASE_URL = targetUrl;
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('Connected to target database.');

    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const data: Record<string, any[]> = JSON.parse(raw, (_, value) => {
      if (value && typeof value === 'object' && '__type' in value) {
        switch (value.__type) {
          case 'bigint': return BigInt(value.value);
          case 'date': return new Date(value.value);
          case 'decimal': return parseFloat(value.value);
        }
      }
      return value;
    });

    // Disable FK constraints
    await prisma.$executeRawUnsafe('SET session_replication_role = replica;');
    console.log('Disabled FK constraint checks.\n');

    // Define the import order and their Prisma model accessor names
    const tables: Array<{ table: string; model: keyof typeof prisma }> = [
      { table: 'Restaurant', model: 'restaurant' as any },
      { table: 'Branch', model: 'branch' as any },
      { table: 'Customer', model: 'customer' as any },
      { table: 'StaffShift', model: 'staffShift' as any },
      { table: 'User', model: 'user' as any },
      { table: 'UserBranch', model: 'userBranch' as any },
      { table: 'RefreshToken', model: 'refreshToken' as any },
      { table: 'Category', model: 'category' as any },
      { table: 'MenuItem', model: 'menuItem' as any },
      { table: 'ModifierGroup', model: 'modifierGroup' as any },
      { table: 'Modifier', model: 'modifier' as any },
      { table: 'MenuItemModifierGroup', model: 'menuItemModifierGroup' as any },
      { table: 'Section', model: 'section' as any },
      { table: 'Table', model: 'table' as any },
      { table: 'Discount', model: 'discount' as any },
      { table: 'Coupon', model: 'coupon' as any },
      { table: 'TableSession', model: 'tableSession' as any },
      { table: 'GroupOrder', model: 'groupOrder' as any },
      { table: 'GroupParticipant', model: 'groupParticipant' as any },
      { table: 'GroupCartItem', model: 'groupCartItem' as any },
      { table: 'Order', model: 'order' as any },
      { table: 'OrderItem', model: 'orderItem' as any },
      { table: 'OrderItemModifier', model: 'orderItemModifier' as any },
      { table: 'OrderDiscount', model: 'orderDiscount' as any },
      { table: 'Payment', model: 'payment' as any },
      { table: 'ServiceRequest', model: 'serviceRequest' as any },
      { table: 'Feedback', model: 'feedback' as any },
      { table: 'Receipt', model: 'receipt' as any },
      { table: 'Supplier', model: 'supplier' as any },
      { table: 'Ingredient', model: 'ingredient' as any },
      { table: 'IngredientSupplier', model: 'ingredientSupplier' as any },
      { table: 'Recipe', model: 'recipe' as any },
      { table: 'StockMovement', model: 'stockMovement' as any },
      { table: 'PurchaseOrder', model: 'purchaseOrder' as any },
      { table: 'PurchaseOrderItem', model: 'purchaseOrderItem' as any },
      { table: 'CustomerInteraction', model: 'customerInteraction' as any },
      { table: 'BiometricDevice', model: 'biometricDevice' as any },
      { table: 'BiometricUserMap', model: 'biometricUserMap' as any },
      { table: 'BiometricTemplate', model: 'biometricTemplate' as any },
      { table: 'BiometricLog', model: 'biometricLog' as any },
      { table: 'ShiftAssignment', model: 'shiftAssignment' as any },
      { table: 'Attendance', model: 'attendance' as any },
      { table: 'LeaveRequest', model: 'leaveRequest' as any },
      { table: 'PayrollConfig', model: 'payrollConfig' as any },
      { table: 'PayrollRun', model: 'payrollRun' as any },
      { table: 'CreditAccount', model: 'creditAccount' as any },
      { table: 'CreditTransaction', model: 'creditTransaction' as any },
    ];

    let totalInserted = 0;

    for (const { table, model } of tables) {
      const rows = data[table];
      if (!rows || rows.length === 0) continue;

      try {
        // Clear existing data
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);

        // Convert date strings to Date objects in all rows
        const cleanRows = rows.map((row: any) => {
          const clean: any = {};
          for (const [key, val] of Object.entries(row)) {
            if (val === null || val === undefined) {
              clean[key] = val;
            } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
              clean[key] = new Date(val);
            } else {
              clean[key] = val;
            }
          }
          return clean;
        });

        // Use createMany for batch insert with proper type handling
        const prismaModel = (prisma as any)[model];
        if (!prismaModel) {
          console.log(`  ? ${table}: model "${String(model)}" not found on Prisma client, skipping`);
          continue;
        }

        // Insert in batches of 100 to avoid query size limits
        const batchSize = 100;
        let inserted = 0;
        for (let i = 0; i < cleanRows.length; i += batchSize) {
          const batch = cleanRows.slice(i, i + batchSize);
          try {
            await prismaModel.createMany({ data: batch, skipDuplicates: true });
            inserted += batch.length;
          } catch (batchErr: any) {
            // If batch fails, try one by one
            for (const row of batch) {
              try {
                await prismaModel.create({ data: row });
                inserted++;
              } catch (rowErr: any) {
                console.error(`    Row failed in ${table}: ${rowErr.message?.substring(0, 120)}`);
              }
            }
          }
        }

        totalInserted += inserted;
        console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows`);
      } catch (err: any) {
        console.error(`  ✗ ${table}: ${err.message?.substring(0, 150)}`);
      }
    }

    // Re-enable FK constraints
    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
    console.log('\nRe-enabled FK constraint checks.');
    console.log(`\n✅ Imported ${totalInserted} total rows`);
  } finally {
    await prisma.$disconnect();
  }
}

const targetUrl = process.argv[2];
importData(targetUrl).catch(console.error);
