-- LOW-07/08: Remove dead OldPaymentStatus enum and unused paymentStatus column
-- Run: psql -d <database> -f remove_old_payment_status.sql
-- Or apply via: prisma migrate dev --name remove_old_payment_status

ALTER TABLE "Order" DROP COLUMN IF EXISTS "paymentStatus";
DROP TYPE IF EXISTS "OldPaymentStatus";
