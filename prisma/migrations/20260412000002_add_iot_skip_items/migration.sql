-- AlterTable: thêm cột skipItems vào iot_sources
ALTER TABLE "iot_sources" ADD COLUMN "skipItems" JSONB NOT NULL DEFAULT '[]';
