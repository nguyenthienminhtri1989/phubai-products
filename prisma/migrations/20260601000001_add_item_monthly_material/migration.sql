-- CreateTable: item_monthly_materials (idempotent)
CREATE TABLE IF NOT EXISTS "item_monthly_materials" (
  "id" SERIAL PRIMARY KEY,
  "itemId" INTEGER NOT NULL,
  "yearMonth" VARCHAR(7) NOT NULL,
  "cottonMaterialTypeId" INTEGER,
  "peMaterialTypeId" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "item_monthly_materials_itemId_yearMonth_key"
  ON "item_monthly_materials"("itemId", "yearMonth");
CREATE INDEX IF NOT EXISTS "item_monthly_materials_yearMonth_idx"
  ON "item_monthly_materials"("yearMonth");

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_cotton_fkey"
    FOREIGN KEY ("cottonMaterialTypeId") REFERENCES "material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_pe_fkey"
    FOREIGN KEY ("peMaterialTypeId") REFERENCES "material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
