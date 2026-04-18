-- CreateTable
CREATE TABLE "meter_group_categories" (
    "id" SERIAL NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_group_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meter_group_categories_groupCode_key" ON "meter_group_categories"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "meter_group_categories_groupName_key" ON "meter_group_categories"("groupName");
