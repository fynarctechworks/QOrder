-- Add sequential token number for QSR receipts
ALTER TABLE "Order" ADD COLUMN "tokenNumber" INTEGER;
