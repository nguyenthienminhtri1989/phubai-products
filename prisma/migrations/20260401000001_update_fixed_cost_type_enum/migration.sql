-- Cập nhật enum FixedCostType: thay 14 giá trị cũ bằng 14 giá trị mới đúng nghiệp vụ
-- PostgreSQL không cho rename enum value trực tiếp → phải:
-- 1. Đổi cột sang TEXT
-- 2. DROP enum cũ
-- 3. Tạo enum mới
-- 4. Migrate dữ liệu (old → new)
-- 5. Đổi cột trở lại enum mới

-- Step 1: Convert costType column to TEXT
ALTER TABLE "fixed_cost_entries" ALTER COLUMN "costType" TYPE TEXT;

-- Step 2: Drop old enum type
DROP TYPE "FixedCostType";

-- Step 3: Create new enum with correct business values
CREATE TYPE "FixedCostType" AS ENUM (
  'TIEN_LUONG',
  'TRICH_TRUOC_LUONG',
  'TIEN_AN_CA',
  'BHXH_YT_TN_KPCD',
  'TIEN_DIEN',
  'KHAU_HAO',
  'ONG_CONE_BAO_PP',
  'CHI_PHI_VAT_LIEU',
  'CHI_PHI_QUAN_LY',
  'LAI_VAY_VCD',
  'LAI_VAY_VLD',
  'LO_CHENH_LECH_TY_GIA',
  'DOANH_THU_HDTC',
  'KHAC'
);

-- Step 4: Migrate existing data (old value → new value)
UPDATE "fixed_cost_entries" SET "costType" = 'TIEN_LUONG'           WHERE "costType" = 'LUONG_CHINH';
UPDATE "fixed_cost_entries" SET "costType" = 'TIEN_AN_CA'           WHERE "costType" = 'CP_SUA_CHUA';
UPDATE "fixed_cost_entries" SET "costType" = 'BHXH_YT_TN_KPCD'     WHERE "costType" = 'CP_HOA_CHAT';
UPDATE "fixed_cost_entries" SET "costType" = 'ONG_CONE_BAO_PP'      WHERE "costType" = 'CP_VAT_LIEU_PKD';
UPDATE "fixed_cost_entries" SET "costType" = 'CHI_PHI_VAT_LIEU'     WHERE "costType" = 'CP_DICH_VU_MUA_NGOAI';
UPDATE "fixed_cost_entries" SET "costType" = 'CHI_PHI_QUAN_LY'      WHERE "costType" = 'CP_QUAN_LY';
UPDATE "fixed_cost_entries" SET "costType" = 'LO_CHENH_LECH_TY_GIA' WHERE "costType" = 'CP_DAU_TU_XHH';
UPDATE "fixed_cost_entries" SET "costType" = 'DOANH_THU_HDTC'       WHERE "costType" = 'DT_HDTC';
UPDATE "fixed_cost_entries" SET "costType" = 'KHAC'                  WHERE "costType" = 'CP_KHAC';
-- TRICH_TRUOC_LUONG, TIEN_DIEN, KHAU_HAO, LAI_VAY_VCD, LAI_VAY_VLD giữ nguyên

-- Step 5: Convert column back to the new enum type
ALTER TABLE "fixed_cost_entries" ALTER COLUMN "costType" TYPE "FixedCostType" USING "costType"::"FixedCostType";
