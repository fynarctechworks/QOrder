-- Add unique index on Payment.gatewayPaymentId
-- This prevents duplicate payment records for the same gateway transaction.
-- NULL values are allowed (non-online payments don't have a gatewayPaymentId).
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_gatewayPaymentId_unique"
  ON "Payment" ("gatewayPaymentId")
  WHERE "gatewayPaymentId" IS NOT NULL;
