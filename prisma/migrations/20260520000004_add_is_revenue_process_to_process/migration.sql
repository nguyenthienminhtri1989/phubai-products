-- AlterTable: Add isRevenueProcess flag to Process
-- Mark which Process is the revenue stage (typically "công đoạn ống").
-- Dashboard v2 production-matrix and allocation engine only count finalOutput from machines belonging to a Process where isRevenueProcess = true.
-- IF NOT EXISTS: column may already exist from prior `db push` on dev DB.
ALTER TABLE "processes" ADD COLUMN IF NOT EXISTS "isRevenueProcess" BOOLEAN NOT NULL DEFAULT false;
