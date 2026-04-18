-- CreateEnum
CREATE TYPE "IotFileFormat" AS ENUM ('STANDARD', 'DANH_ONG');

-- AlterTable
ALTER TABLE "iot_sources" ADD COLUMN "fileFormat" "IotFileFormat" NOT NULL DEFAULT 'STANDARD';
