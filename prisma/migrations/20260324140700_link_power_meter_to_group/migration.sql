-- AlterTable
ALTER TABLE "power_meters" ADD COLUMN     "meterGroupId" INTEGER;

-- AddForeignKey
ALTER TABLE "power_meters" ADD CONSTRAINT "power_meters_meterGroupId_fkey" FOREIGN KEY ("meterGroupId") REFERENCES "meter_group_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
