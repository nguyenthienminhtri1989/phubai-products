-- CreateTable: Bảng trung gian User <-> Process
CREATE TABLE "user_processes" (
    "userId" INTEGER NOT NULL,
    "processId" INTEGER NOT NULL,
    CONSTRAINT "user_processes_pkey" PRIMARY KEY ("userId","processId")
);

-- Migrate dữ liệu cũ: processId từ users sang user_processes
INSERT INTO "user_processes" ("userId", "processId")
SELECT "id", "processId" FROM "users" WHERE "processId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "user_processes" ADD CONSTRAINT "user_processes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_processes" ADD CONSTRAINT "user_processes_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Xóa cột processId cũ khỏi users
ALTER TABLE "users" DROP COLUMN "processId";
