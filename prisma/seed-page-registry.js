// Đồng bộ toàn bộ danh sách trang vào bảng PageRegistry.
// Nguồn chân lý: ALL_PAGES trong src/components/AdminLayout.tsx
// Mỗi khi thêm trang mới vào AdminLayout, thêm dòng tương ứng vào đây rồi chạy:
//   node prisma/seed-page-registry.js
// Script dùng upsert theo pageKey nên an toàn, chạy nhiều lần không tạo trùng.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// pageName = tên hiển thị trong bảng phân quyền.
// sortOrder tăng dần trong cùng pageGroup (số nhỏ hiện trước).
const PAGES = [
  // TỔNG QUAN
  { pageKey: "dashboard.overview", pageName: "Tổng quan", pageGroup: "TỔNG QUAN", path: "/", sortOrder: 10 },

  // SẢN XUẤT
  { pageKey: "sx.machines", pageName: "Máy móc & Điều phối", pageGroup: "SẢN XUẤT", path: "/machines", sortOrder: 100 },
  { pageKey: "sx.daily-input", pageName: "Nhập sản lượng (Thẻ)", pageGroup: "SẢN XUẤT", path: "/production/daily-input", sortOrder: 101 },
  { pageKey: "sx.daily-input-grid", pageName: "Nhập sản lượng (Bảng)", pageGroup: "SẢN XUẤT", path: "/production/daily-input-grid", sortOrder: 102 },
  { pageKey: "sx.winding-input", pageName: "Nhập liệu đánh ống", pageGroup: "SẢN XUẤT", path: "/production/winding-input", sortOrder: 103 },
  { pageKey: "sx.iot-import", pageName: "Import IoT", pageGroup: "SẢN XUẤT", path: "/iot-import", sortOrder: 104 },
  { pageKey: "sx.line-setup", pageName: "Thiết lập line SX", pageGroup: "SẢN XUẤT", path: "/production/line-setup", sortOrder: 105 },
  { pageKey: "sx.line-diagram", pageName: "Sơ đồ line SX", pageGroup: "SẢN XUẤT", path: "/production/line-diagram", sortOrder: 106 },
  { pageKey: "sx.qr-machines", pageName: "QR Code máy", pageGroup: "SẢN XUẤT", path: "/machines/qr-machines", sortOrder: 107 },
  { pageKey: "sx.machine-stops", pageName: "Ghi nhận dừng máy", pageGroup: "SẢN XUẤT", path: "/production/machine-stops", sortOrder: 110 },
  { pageKey: "sx.stop-history", pageName: "Lịch sử dừng máy", pageGroup: "SẢN XUẤT", path: "/production/stop-history", sortOrder: 111 },
  { pageKey: "sx.maintenance", pageName: "Nhật ký bảo dưỡng", pageGroup: "SẢN XUẤT", path: "/dashboard/maintenance", sortOrder: 112 },

  // ĐỊNH MỨC
  { pageKey: "benchmark.versions", pageName: "Phiên bản & Chi tiết ĐM", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark", sortOrder: 120 },
  { pageKey: "benchmark.capacity", pageName: "Năng lực sản xuất", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/capacity", sortOrder: 121 },
  { pageKey: "benchmark.comparison", pageName: "So sánh thực tế vs ĐM", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/comparison", sortOrder: 122 },

  // ĐIỆN NĂNG
  { pageKey: "energy.prices", pageName: "Đơn giá điện", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/prices", sortOrder: 130 },
  { pageKey: "energy.daily-input", pageName: "Nhập chỉ số điện", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/daily-input", sortOrder: 131 },
  { pageKey: "energy.reports", pageName: "Báo cáo tiêu thụ", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/reports", sortOrder: 132 },
  { pageKey: "energy.live", pageName: "Giám sát trực tiếp", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/live", sortOrder: 133 },

  // KINH DOANH
  { pageKey: "kdsx.dashboard", pageName: "Dashboard tổng hợp", pageGroup: "KINH DOANH", path: "/kdsx", sortOrder: 140 },
  { pageKey: "kdsx.revenue", pageName: "Doanh thu – Lợi nhuận", pageGroup: "KINH DOANH", path: "/kdsx/revenue", sortOrder: 141 },
  { pageKey: "kdsx.production-schedule", pageName: "Kế hoạch & Thực hiện", pageGroup: "KINH DOANH", path: "/kdsx/production-schedule", sortOrder: 142 },
  { pageKey: "kdsx.plans", pageName: "Kế hoạch tháng (Cũ)", pageGroup: "KINH DOANH", path: "/kdsx/plans", sortOrder: 143 },
  { pageKey: "kdsx.customers", pageName: "Khách hàng", pageGroup: "KINH DOANH", path: "/kdsx/customers", sortOrder: 144 },
  { pageKey: "kdsx.sales-orders", pageName: "Hợp đồng bán hàng", pageGroup: "KINH DOANH", path: "/kdsx/sales-orders", sortOrder: 145 },
  { pageKey: "kdsx.monthly-quotas", pageName: "Phân bổ tháng", pageGroup: "KINH DOANH", path: "/kdsx/monthly-quotas", sortOrder: 146 },
  { pageKey: "kdsx.order-progress", pageName: "Tiến độ đơn hàng", pageGroup: "KINH DOANH", path: "/kdsx/order-progress", sortOrder: 147 },
  { pageKey: "kdsx.actuals", pageName: "Thực hiện tháng (Cũ)", pageGroup: "KINH DOANH", path: "/kdsx/actuals", sortOrder: 148 },
  { pageKey: "kdsx.sales-tracking", pageName: "Theo dõi đơn hàng", pageGroup: "KINH DOANH", path: "/sales-orders", sortOrder: 149 },

  // MOBILE
  { pageKey: "mobile.input", pageName: "Nhập liệu (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-input", sortOrder: 150 },
  { pageKey: "mobile.winding", pageName: "Nhập liệu đánh ống (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-winding", sortOrder: 151 },
  { pageKey: "mobile.report", pageName: "Báo cáo sản lượng (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-report", sortOrder: 152 },
  { pageKey: "mobile.stops", pageName: "Báo sự cố (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-stops", sortOrder: 153 },
  { pageKey: "mobile.maintenance", pageName: "Bảo dưỡng máy (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-maintenance", sortOrder: 154 },

  // BÁO CÁO
  { pageKey: "report.history", pageName: "Lịch sử & Báo cáo", pageGroup: "BÁO CÁO", path: "/production/history", sortOrder: 160 },
  { pageKey: "report.production", pageName: "Biểu đồ sản lượng", pageGroup: "BÁO CÁO", path: "/reports/production", sortOrder: 161 },

  // DANH MỤC
  { pageKey: "catalog.factories", pageName: "Nhà máy", pageGroup: "DANH MỤC", path: "/factories", sortOrder: 170 },
  { pageKey: "catalog.processes", pageName: "Công đoạn", pageGroup: "DANH MỤC", path: "/processes", sortOrder: 171 },
  { pageKey: "catalog.items", pageName: "Mặt hàng", pageGroup: "DANH MỤC", path: "/items", sortOrder: 172 },
  { pageKey: "catalog.lots", pageName: "Danh mục lô hàng", pageGroup: "DANH MỤC", path: "/lots", sortOrder: 173 },
  { pageKey: "catalog.shifts", pageName: "Ca làm việc", pageGroup: "DANH MỤC", path: "/categories/shift", sortOrder: 174 },
  { pageKey: "catalog.stop-cats", pageName: "Nguyên nhân dừng", pageGroup: "DANH MỤC", path: "/dashboard/stop-categories", sortOrder: 175 },
  { pageKey: "kdsx.raw-material-rates", pageName: "Mức tiêu hao NVL", pageGroup: "DANH MỤC", path: "/kdsx/raw-material-rates", sortOrder: 176 },
  { pageKey: "kdsx.material-types", pageName: "Danh mục Bông Xơ", pageGroup: "DANH MỤC", path: "/kdsx/material-types", sortOrder: 177 },
  { pageKey: "kdsx.material-prices", pageName: "Giá Bông Xơ", pageGroup: "DANH MỤC", path: "/kdsx/material-prices", sortOrder: 178 },
  { pageKey: "kdsx.item-monthly-materials", pageName: "Cơ cấu NVL theo tháng", pageGroup: "DANH MỤC", path: "/kdsx/item-monthly-materials", sortOrder: 179 },
  { pageKey: "catalog.energy-type", pageName: "Loại điện năng", pageGroup: "DANH MỤC", path: "/categories/energy-type", sortOrder: 179 },
  { pageKey: "catalog.meter-group", pageName: "Nhóm đồng hồ điện", pageGroup: "DANH MỤC", path: "/categories/meter-group", sortOrder: 180 },
  { pageKey: "catalog.meters", pageName: "Trạm & Đồng hồ", pageGroup: "DANH MỤC", path: "/categories/meters", sortOrder: 181 },

  // HỆ THỐNG
  { pageKey: "system.users", pageName: "Quản lý Tài khoản", pageGroup: "HỆ THỐNG", path: "/users", sortOrder: 190 },
  { pageKey: "system.permissions", pageName: "Phân quyền", pageGroup: "HỆ THỐNG", path: "/admin/permissions", sortOrder: 191 },
  { pageKey: "system.page-registry", pageName: "Danh sách Trang", pageGroup: "HỆ THỐNG", path: "/admin/page-registry", sortOrder: 192 },
  { pageKey: "system.backup", pageName: "Sao lưu & Phục hồi", pageGroup: "HỆ THỐNG", path: "/admin/backup", sortOrder: 193 },
  { pageKey: "system.feedback", pageName: "Góp ý & Đề xuất", pageGroup: "HỆ THỐNG", path: "/feedback", sortOrder: 194 },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const entry of PAGES) {
    const existing = await prisma.pageRegistry.findUnique({
      where: { pageKey: entry.pageKey },
    });
    await prisma.pageRegistry.upsert({
      where: { pageKey: entry.pageKey },
      update: entry,
      create: entry,
    });
    if (existing) updated++;
    else {
      created++;
      console.log("  + Thêm mới:", entry.pageKey, "->", entry.path);
    }
  }
  console.log(`\nĐồng bộ PageRegistry xong: ${created} thêm mới, ${updated} cập nhật, tổng ${PAGES.length} trang.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
