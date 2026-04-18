-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DOMESTIC', 'FOREIGN');

-- AlterTable
ALTER TABLE "customers"
  ADD COLUMN "address"      TEXT,
  ADD COLUMN "phone"        TEXT,
  ADD COLUMN "email"        TEXT,
  ADD COLUMN "taxCode"      TEXT,
  ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'DOMESTIC';
