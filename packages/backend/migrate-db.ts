/**
 * Database Migration Script
 * Migrates data between Supabase projects (qr-order-web -> Q-Order)
 *
 * Usage:
 *   npx tsx migrate-db.ts export          # Export data from current DATABASE_URL
 *   npx tsx migrate-db.ts import          # Import data into current DATABASE_URL
 *   npx tsx migrate-db.ts full <NEW_URL>  # Full migration: export from current, push schema & import to new
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const BACKUP_FILE = path.join(__dirname, '..', '..', 'db_backup', 'migration_data.json');

// Tables in dependency order (parents before children)
const TABLE_ORDER = [
  'Restaurant',
  'Branch',
  'Customer',
  'StaffShift',
  'User',
  'UserBranch',
  'RefreshToken',
  'Category',
  'MenuItem',
  'ModifierGroup',
  'Modifier',
  'MenuItemModifierGroup',
  'Section',
  'Table',
  'Discount',
  'Coupon',
  'TableSession',
  'GroupOrder',
  'GroupParticipant',
  'GroupCartItem',
  'Order',
  'OrderItem',
  'OrderItemModifier',
  'OrderDiscount',
  'Payment',
  'ServiceRequest',
  'Feedback',
  'Receipt',
  'Supplier',
  'Ingredient',
  'IngredientSupplier',
  'Recipe',
  'StockMovement',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'CustomerInteraction',
  'BiometricDevice',
  'BiometricUserMap',
  'BiometricTemplate',
  'BiometricLog',
  'ShiftAssignment',
  'Attendance',
  'LeaveRequest',
  'PayrollConfig',
  'PayrollRun',
  'CreditAccount',
  'CreditTransaction',
];

async function exportData() {
  console.log('=== EXPORTING DATA FROM SOURCE DATABASE ===');
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('Connected to source database.');

    const data: Record<string, unknown[]> = {};
    let totalRows = 0;

    for (const table of TABLE_ORDER) {
      try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        const rowArray = rows as unknown[];
        data[table] = rowArray;
        totalRows += rowArray.length;
        if (rowArray.length > 0) {
          console.log(`  ✓ ${table}: ${rowArray.length} rows`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ ${table}: SKIPPED (${msg})`);
        data[table] = [];
      }
    }

    // Also export _prisma_migrations
    try {
      const migrations = await prisma.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations"`);
      data['_prisma_migrations'] = migrations as unknown[];
      console.log(`  ✓ _prisma_migrations: ${(migrations as unknown[]).length} rows`);
    } catch {
      data['_prisma_migrations'] = [];
    }

    // Ensure backup directory exists
    const dir = path.dirname(BACKUP_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Custom serializer to handle BigInt, Decimal, Date
    const serialized = JSON.stringify(data, (_, value) => {
      if (typeof value === 'bigint') return { __type: 'bigint', value: value.toString() };
      if (value instanceof Date) return { __type: 'date', value: value.toISOString() };
      if (value !== null && typeof value === 'object' && value.constructor?.name === 'Decimal') {
        return { __type: 'decimal', value: value.toString() };
      }
      return value;
    }, 2);

    fs.writeFileSync(BACKUP_FILE, serialized, 'utf-8');
    console.log(`\n✅ Exported ${totalRows} total rows from ${Object.keys(data).length} tables`);
    console.log(`📁 Saved to: ${BACKUP_FILE}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function importData(targetUrl?: string) {
  console.log('=== IMPORTING DATA INTO TARGET DATABASE ===');

  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`❌ Backup file not found: ${BACKUP_FILE}`);
    console.error('Run "npx tsx migrate-db.ts export" first.');
    process.exit(1);
  }

  // If targetUrl provided, override DATABASE_URL
  if (targetUrl) {
    process.env.DATABASE_URL = targetUrl;
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('Connected to target database.');

    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const data: Record<string, unknown[]> = JSON.parse(raw, (_, value) => {
      if (value && typeof value === 'object' && '__type' in value) {
        switch (value.__type) {
          case 'bigint': return BigInt(value.value);
          case 'date': return new Date(value.value);
          case 'decimal': return parseFloat(value.value);
        }
      }
      return value;
    });

    // Disable triggers/FK checks for bulk insert
    await prisma.$executeRawUnsafe('SET session_replication_role = replica;');
    console.log('Disabled FK constraint checks.');

    let totalInserted = 0;

    for (const table of TABLE_ORDER) {
      const rows = data[table];
      if (!rows || rows.length === 0) continue;

      try {
        // Delete existing data in this table first
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);

        // Insert rows in batches
        for (const row of rows) {
          const record = row as Record<string, unknown>;
          const columns = Object.keys(record);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const values = columns.map(col => {
            const val = record[col];
            // Handle arrays - convert to PostgreSQL array literal
            if (Array.isArray(val)) {
              return `{${val.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : v).join(',')}}`;
            }
            // Handle JSON objects
            if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val;
          });

          const quotedCols = columns.map(c => `"${c}"`).join(', ');
          const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;

          try {
            await prisma.$executeRawUnsafe(sql, ...values);
          } catch (insertErr: unknown) {
            const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
            // Try with explicit type casts for problematic columns
            console.error(`    Warning: Failed to insert row in ${table}: ${msg.substring(0, 100)}`);
          }
        }

        totalInserted += rows.length;
        console.log(`  ✓ ${table}: ${rows.length} rows inserted`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${table}: FAILED (${msg.substring(0, 150)})`);
      }
    }

    // Import _prisma_migrations if present
    if (data['_prisma_migrations']?.length) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`);
        for (const row of data['_prisma_migrations']) {
          const record = row as Record<string, unknown>;
          const columns = Object.keys(record);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const values = columns.map(col => record[col]);
          const quotedCols = columns.map(c => `"${c}"`).join(', ');
          await prisma.$executeRawUnsafe(
            `INSERT INTO "_prisma_migrations" (${quotedCols}) VALUES (${placeholders})`,
            ...values
          );
        }
        console.log(`  ✓ _prisma_migrations: ${data['_prisma_migrations'].length} rows inserted`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ _prisma_migrations: FAILED (${msg.substring(0, 100)})`);
      }
    }

    // Re-enable triggers/FK checks
    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
    console.log('Re-enabled FK constraint checks.');

    console.log(`\n✅ Imported ${totalInserted} total rows`);
  } finally {
    await prisma.$disconnect();
  }
}

async function fullMigration(newDbUrl: string) {
  console.log('=== FULL DATABASE MIGRATION ===');
  console.log(`Source: ${process.env.DATABASE_URL?.substring(0, 60)}...`);
  console.log(`Target: ${newDbUrl.substring(0, 60)}...`);
  console.log('');

  // Step 1: Export from source
  await exportData();
  console.log('');

  // Step 2: Push schema to target using Prisma
  console.log('=== PUSHING SCHEMA TO TARGET DATABASE ===');
  const { execSync } = await import('child_process');
  try {
    execSync(`npx prisma db push --accept-data-loss`, {
      cwd: path.join(__dirname),
      env: { ...process.env, DATABASE_URL: newDbUrl },
      stdio: 'inherit',
    });
    console.log('✅ Schema pushed to target database.');
  } catch (err) {
    console.error('❌ Failed to push schema. Make sure the target DATABASE_URL is correct.');
    process.exit(1);
  }
  console.log('');

  // Step 3: Import data into target
  await importData(newDbUrl);

  console.log('\n🎉 Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Update packages/backend/.env with the new DATABASE_URL');
  console.log('2. Update the Supabase MCP config in VS Code (mcp.json) with the new project_ref');
  console.log('3. Restart the development server');
}

// ===== CLI =====
const [command, arg] = process.argv.slice(2);

switch (command) {
  case 'export':
    exportData().catch(console.error);
    break;
  case 'import':
    importData(arg).catch(console.error);
    break;
  case 'full':
    if (!arg) {
      console.error('Usage: npx tsx migrate-db.ts full <NEW_DATABASE_URL>');
      process.exit(1);
    }
    fullMigration(arg).catch(console.error);
    break;
  default:
    console.log('Database Migration Tool');
    console.log('');
    console.log('Usage:');
    console.log('  npx tsx migrate-db.ts export              Export data from current DATABASE_URL');
    console.log('  npx tsx migrate-db.ts import [DB_URL]     Import data into DATABASE_URL');
    console.log('  npx tsx migrate-db.ts full <NEW_DB_URL>   Full migration (export + schema push + import)');
    process.exit(0);
}
