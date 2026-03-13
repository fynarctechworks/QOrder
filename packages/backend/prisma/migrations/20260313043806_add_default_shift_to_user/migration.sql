-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultShiftId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultShiftId_fkey" FOREIGN KEY ("defaultShiftId") REFERENCES "StaffShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "User_defaultShiftId_idx" ON "User"("defaultShiftId");
