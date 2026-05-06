-- CreateTable: Bảng trung gian User <-> Factory (nhiều-nhiều)
-- Dùng cho STATISTICIAN cần truy cập nhiều nhà máy

CREATE TABLE "user_factories" (
    "userId" INTEGER NOT NULL,
    "factoryId" INTEGER NOT NULL,

    CONSTRAINT "user_factories_pkey" PRIMARY KEY ("userId","factoryId")
);

-- AddForeignKey
ALTER TABLE "user_factories" ADD CONSTRAINT "user_factories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_factories" ADD CONSTRAINT "user_factories_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
