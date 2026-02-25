-- DropIndex (was removed from schema.prisma)
-- The old @@unique([tableId, status]) full unique constraint was removed.
-- Replace with a partial unique index that only enforces uniqueness for ACTIVE sessions.

DROP INDEX IF EXISTS "TableSession_tableId_status_key";

CREATE UNIQUE INDEX "TableSession_active_table_unique"
  ON "TableSession" ("tableId")
  WHERE status = 'ACTIVE';
