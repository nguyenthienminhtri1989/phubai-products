-- CreateEnum
CREATE TYPE "Department" AS ENUM ('FACTORY', 'MANAGEMENT', 'SALES', 'ACCOUNTING', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "department" "Department" NOT NULL DEFAULT 'FACTORY';
ALTER TABLE "users" ADD COLUMN "extraModules" TEXT[] NOT NULL DEFAULT '{}';