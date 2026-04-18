-- Migration: Add Page Permissions and User Roles
-- This migration converts the old role/accessLevel/department system to the new UserRole enum + PagePermission system

-- Step 1: Create the UserRole enum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DIRECTOR', 'FACTORY_MANAGER', 'SALES', 'PROCESS_LEAD', 'STATISTICIAN', 'TEAM_LEAD', 'VIEWER');

-- Step 2: Add new columns to users (keeping old columns temporarily for data migration)
ALTER TABLE "users" ADD COLUMN "userRole" "UserRole" NOT NULL DEFAULT 'VIEWER';
ALTER TABLE "users" ADD COLUMN "factoryId" INTEGER;

-- Step 3: Migrate existing data from old columns to new userRole
-- ADMIN -> ADMIN
UPDATE "users" SET "userRole" = 'ADMIN' WHERE "role" = 'ADMIN';

-- MANAGEMENT department -> DIRECTOR
UPDATE "users" SET "userRole" = 'DIRECTOR' WHERE "department" = 'MANAGEMENT' AND "role" != 'ADMIN';

-- SALES department -> SALES
UPDATE "users" SET "userRole" = 'SALES' WHERE "department" = 'SALES' AND "role" != 'ADMIN';

-- FACTORY + MANAGER -> FACTORY_MANAGER
UPDATE "users" SET "userRole" = 'FACTORY_MANAGER' WHERE "department" = 'FACTORY' AND "accessLevel" = 'MANAGER' AND "role" != 'ADMIN';

-- FACTORY + OPERATOR -> STATISTICIAN
UPDATE "users" SET "userRole" = 'STATISTICIAN' WHERE "department" = 'FACTORY' AND "accessLevel" = 'OPERATOR' AND "role" != 'ADMIN';

-- FACTORY + READ_ONLY (non-admin) -> VIEWER
UPDATE "users" SET "userRole" = 'VIEWER' WHERE "department" = 'FACTORY' AND "accessLevel" = 'READ_ONLY' AND "role" != 'ADMIN';

-- ACCOUNTING -> VIEWER (can be upgraded later via PagePermissions)
UPDATE "users" SET "userRole" = 'VIEWER' WHERE "department" = 'ACCOUNTING' AND "role" != 'ADMIN';

-- WAREHOUSE -> VIEWER
UPDATE "users" SET "userRole" = 'VIEWER' WHERE "department" = 'WAREHOUSE' AND "role" != 'ADMIN';

-- Step 4: Drop old columns
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" DROP COLUMN "accessLevel";
ALTER TABLE "users" DROP COLUMN "department";
ALTER TABLE "users" DROP COLUMN "extraModules";

-- Step 5: Drop old Department enum
DROP TYPE "Department";

-- Step 6: Create PageRegistry table
CREATE TABLE "page_registry" (
    "id" SERIAL NOT NULL,
    "pageKey" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageGroup" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "page_registry_pkey" PRIMARY KEY ("id")
);

-- Step 7: Create PagePermission table
CREATE TABLE "page_permissions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "page_permissions_pkey" PRIMARY KEY ("id")
);

-- Step 8: Create indexes
CREATE UNIQUE INDEX "page_registry_pageKey_key" ON "page_registry"("pageKey");
CREATE INDEX "page_permissions_userId_idx" ON "page_permissions"("userId");
CREATE UNIQUE INDEX "page_permissions_userId_pageId_key" ON "page_permissions"("userId", "pageId");

-- Step 9: Add foreign keys
ALTER TABLE "users" ADD CONSTRAINT "users_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "page_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Seed PageRegistry with all pages
INSERT INTO "page_registry" ("pageKey", "pageName", "pageGroup", "path", "sortOrder") VALUES
  -- SẢN XUẤT
  ('sx.machines',           'Máy móc & Điều phối',     'SẢN XUẤT',    '/machines',                     100),
  ('sx.daily-input',        'Nhập sản lượng',          'SẢN XUẤT',    '/production/daily-input',       101),
  ('sx.line-setup',         'Thiết lập line SX',       'SẢN XUẤT',    '/production/line-setup',        102),
  ('sx.line-diagram',       'Sơ đồ line SX',          'SẢN XUẤT',    '/production/line-diagram',      103),
  ('sx.qr-machines',        'QR Code máy',             'SẢN XUẤT',    '/machines/qr-machines',         104),
  ('sx.iot-import',         'Import IoT',              'SẢN XUẤT',    '/iot-import',                   105),
  ('sx.machine-stops',      'Ghi nhận dừng máy',      'SẢN XUẤT',    '/production/machine-stops',     110),
  ('sx.stop-history',       'Lịch sử dừng máy',       'SẢN XUẤT',    '/production/stop-history',      111),
  ('sx.maintenance',        'Nhật ký bảo dưỡng',      'SẢN XUẤT',    '/dashboard/maintenance',        112),
  -- ĐỊNH MỨC NĂNG SUẤT
  ('benchmark.versions',    'Phiên bản & Chi tiết ĐM', 'ĐỊNH MỨC',   '/dashboard/productivity-benchmark',            200),
  ('benchmark.capacity',    'Năng lực sản xuất',       'ĐỊNH MỨC',   '/dashboard/productivity-benchmark/capacity',   201),
  ('benchmark.comparison',  'So sánh thực tế vs ĐM',  'ĐỊNH MỨC',   '/dashboard/productivity-benchmark/comparison', 202),
  -- ĐIỆN NĂNG
  ('energy.prices',         'Đơn giá điện',            'ĐIỆN NĂNG',   '/dashboard/energy/prices',      300),
  ('energy.daily-input',    'Nhập chỉ số điện',        'ĐIỆN NĂNG',   '/dashboard/energy/daily-input', 301),
  ('energy.reports',        'Báo cáo tiêu thụ',        'ĐIỆN NĂNG',   '/dashboard/energy/reports',     302),
  ('energy.live',           'Giám sát trực tiếp',      'ĐIỆN NĂNG',   '/dashboard/energy/live',        303),
  -- KINH DOANH
  ('kdsx.dashboard',        'Dashboard tổng hợp',      'KINH DOANH',  '/kdsx',                         400),
  ('kdsx.customers',        'Khách hàng',              'KINH DOANH',  '/kdsx/customers',               401),
  ('kdsx.sales-orders',     'Hợp đồng bán hàng',      'KINH DOANH',  '/kdsx/sales-orders',            402),
  ('kdsx.order-progress',   'Tiến độ đơn hàng',        'KINH DOANH',  '/kdsx/order-progress',          403),
  ('kdsx.plans',            'Kế hoạch tháng',          'KINH DOANH',  '/kdsx/plans',                   404),
  ('kdsx.actuals',          'Thực hiện tháng',         'KINH DOANH',  '/kdsx/actuals',                 405),
  ('kdsx.sales-tracking',   'Theo dõi đơn hàng',       'KINH DOANH',  '/sales-orders',                 406),
  ('kdsx.daily-input',      'Nhập SL ngày (KD)',        'KINH DOANH',  '/kd-daily-input',               407),
  -- BÁO CÁO
  ('report.history',        'Lịch sử & Báo cáo',      'BÁO CÁO',    '/production/history',           500),
  ('report.production',     'Biểu đồ sản lượng',      'BÁO CÁO',    '/reports/production',           501),
  -- DANH MỤC
  ('catalog.factories',     'Nhà máy',                 'DANH MỤC',   '/factories',                    600),
  ('catalog.processes',     'Công đoạn',               'DANH MỤC',   '/processes',                    601),
  ('catalog.items',         'Mặt hàng',                'DANH MỤC',   '/items',                        602),
  ('catalog.shifts',        'Ca làm việc',             'DANH MỤC',   '/categories/shift',             603),
  ('catalog.stop-cats',     'Nguyên nhân dừng',        'DANH MỤC',   '/dashboard/stop-categories',    604),
  ('catalog.energy-type',   'Loại điện năng',          'DANH MỤC',   '/categories/energy-type',       605),
  ('catalog.meter-group',   'Nhóm đồng hồ điện',      'DANH MỤC',   '/categories/meter-group',       606),
  ('catalog.meters',        'Trạm & Đồng hồ',         'DANH MỤC',   '/categories/meters',            607),
  -- HỆ THỐNG
  ('system.users',          'Quản lý Tài khoản',      'HỆ THỐNG',   '/users',                        700),
  ('system.permissions',    'Phân quyền',              'HỆ THỐNG',   '/admin/permissions',            701),
  ('system.backup',         'Sao lưu & Phục hồi',     'HỆ THỐNG',   '/admin/backup',                 702),
  ('system.feedback',       'Góp ý & Đề xuất',        'HỆ THỐNG',   '/feedback',                     703),
  -- TỔNG QUAN
  ('dashboard.overview',    'Tổng quan',               'TỔNG QUAN',  '/',                             0)
ON CONFLICT ("pageKey") DO NOTHING;
