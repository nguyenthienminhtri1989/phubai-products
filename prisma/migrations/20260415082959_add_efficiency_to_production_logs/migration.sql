-- AlterTable: Thêm cột efficiency (hiệu suất máy %) vào bảng production_logs
ALTER TABLE "production_logs" ADD COLUMN "efficiency" DOUBLE PRECISION;
