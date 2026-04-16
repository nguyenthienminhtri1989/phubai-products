const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1. Check users
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, userRole: true, isActive: true },
  });
  console.log(`\n👤 Users:`);
  users.forEach(u => {
    console.log(`  [${u.id}] ${u.fullName} (@${u.username}) — role: ${u.userRole}, active: ${u.isActive}`);
  });

  // 2. Upsert all pages (always run — adds new pages if missing)
  console.log(`\n📄 Đang upsert page_registry...`);
  const pages = [
    { pageKey: "dashboard.overview", pageName: "Tổng quan", pageGroup: "TỔNG QUAN", path: "/", sortOrder: 0 },
    { pageKey: "sx.machines", pageName: "Máy móc & Điều phối", pageGroup: "SẢN XUẤT", path: "/machines", sortOrder: 100 },
    { pageKey: "sx.daily-input", pageName: "Nhập sản lượng (Thẻ)", pageGroup: "SẢN XUẤT", path: "/production/daily-input", sortOrder: 101 },
    { pageKey: "sx.daily-input-grid", pageName: "Nhập sản lượng (Bảng)", pageGroup: "SẢN XUẤT", path: "/production/daily-input-grid", sortOrder: 102 },
    { pageKey: "sx.line-setup", pageName: "Thiết lập line SX", pageGroup: "SẢN XUẤT", path: "/production/line-setup", sortOrder: 103 },
    { pageKey: "sx.line-diagram", pageName: "Sơ đồ line SX", pageGroup: "SẢN XUẤT", path: "/production/line-diagram", sortOrder: 103 },
    { pageKey: "sx.qr-machines", pageName: "QR Code máy", pageGroup: "SẢN XUẤT", path: "/machines/qr-machines", sortOrder: 104 },
    { pageKey: "sx.iot-import", pageName: "Import IoT", pageGroup: "SẢN XUẤT", path: "/iot-import", sortOrder: 105 },
    { pageKey: "sx.machine-stops", pageName: "Ghi nhận dừng máy", pageGroup: "SẢN XUẤT", path: "/production/machine-stops", sortOrder: 110 },
    { pageKey: "sx.stop-history", pageName: "Lịch sử dừng máy", pageGroup: "SẢN XUẤT", path: "/production/stop-history", sortOrder: 111 },
    { pageKey: "sx.maintenance", pageName: "Nhật ký bảo dưỡng", pageGroup: "SẢN XUẤT", path: "/dashboard/maintenance", sortOrder: 112 },
    { pageKey: "benchmark.versions", pageName: "Phiên bản & Chi tiết ĐM", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark", sortOrder: 200 },
    { pageKey: "benchmark.capacity", pageName: "Năng lực sản xuất", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/capacity", sortOrder: 201 },
    { pageKey: "benchmark.comparison", pageName: "So sánh thực tế vs ĐM", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/comparison", sortOrder: 202 },
    { pageKey: "energy.prices", pageName: "Đơn giá điện", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/prices", sortOrder: 300 },
    { pageKey: "energy.daily-input", pageName: "Nhập chỉ số điện", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/daily-input", sortOrder: 301 },
    { pageKey: "energy.reports", pageName: "Báo cáo tiêu thụ", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/reports", sortOrder: 302 },
    { pageKey: "energy.live", pageName: "Giám sát trực tiếp", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/live", sortOrder: 303 },
    // MOBILE
    { pageKey: "mobile.input", pageName: "Nhập liệu (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-input", sortOrder: 150 },
    { pageKey: "mobile.report", pageName: "Báo cáo sản lượng (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-report", sortOrder: 151 },
    { pageKey: "mobile.stops", pageName: "Báo sự cố (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-stops", sortOrder: 152 },
    { pageKey: "mobile.maintenance", pageName: "Bảo dưỡng máy (Mobile)", pageGroup: "MOBILE", path: "/production/mobile-maintenance", sortOrder: 153 },
    // KINH DOANH
    { pageKey: "kdsx.dashboard", pageName: "Dashboard tổng hợp", pageGroup: "KINH DOANH", path: "/kdsx", sortOrder: 400 },
    { pageKey: "kdsx.customers", pageName: "Khách hàng", pageGroup: "KINH DOANH", path: "/kdsx/customers", sortOrder: 401 },
    { pageKey: "kdsx.sales-orders", pageName: "Hợp đồng bán hàng", pageGroup: "KINH DOANH", path: "/kdsx/sales-orders", sortOrder: 402 },
    { pageKey: "kdsx.order-progress", pageName: "Tiến độ đơn hàng", pageGroup: "KINH DOANH", path: "/kdsx/order-progress", sortOrder: 403 },
    { pageKey: "kdsx.plans", pageName: "Kế hoạch tháng", pageGroup: "KINH DOANH", path: "/kdsx/plans", sortOrder: 404 },
    { pageKey: "kdsx.actuals", pageName: "Thực hiện tháng", pageGroup: "KINH DOANH", path: "/kdsx/actuals", sortOrder: 405 },
    { pageKey: "kdsx.sales-tracking", pageName: "Theo dõi đơn hàng", pageGroup: "KINH DOANH", path: "/sales-orders", sortOrder: 406 },
    { pageKey: "kdsx.daily-input", pageName: "Nhập SL ngày (KD)", pageGroup: "KINH DOANH", path: "/kd-daily-input", sortOrder: 407 },
    { pageKey: "kdsx.raw-material-rates", pageName: "Định mức NVL", pageGroup: "KINH DOANH", path: "/kdsx/raw-material-rates", sortOrder: 408 },
    { pageKey: "report.history", pageName: "Lịch sử & Báo cáo", pageGroup: "BÁO CÁO", path: "/production/history", sortOrder: 500 },
    { pageKey: "report.production", pageName: "Biểu đồ sản lượng", pageGroup: "BÁO CÁO", path: "/reports/production", sortOrder: 501 },
    { pageKey: "catalog.factories", pageName: "Nhà máy", pageGroup: "DANH MỤC", path: "/factories", sortOrder: 600 },
    { pageKey: "catalog.processes", pageName: "Công đoạn", pageGroup: "DANH MỤC", path: "/processes", sortOrder: 601 },
    { pageKey: "catalog.items", pageName: "Mặt hàng", pageGroup: "DANH MỤC", path: "/items", sortOrder: 602 },
    { pageKey: "catalog.shifts", pageName: "Ca làm việc", pageGroup: "DANH MỤC", path: "/categories/shift", sortOrder: 603 },
    { pageKey: "catalog.stop-cats", pageName: "Nguyên nhân dừng", pageGroup: "DANH MỤC", path: "/dashboard/stop-categories", sortOrder: 604 },
    { pageKey: "catalog.energy-type", pageName: "Loại điện năng", pageGroup: "DANH MỤC", path: "/categories/energy-type", sortOrder: 605 },
    { pageKey: "catalog.meter-group", pageName: "Nhóm đồng hồ điện", pageGroup: "DANH MỤC", path: "/categories/meter-group", sortOrder: 606 },
    { pageKey: "catalog.meters", pageName: "Trạm & Đồng hồ", pageGroup: "DANH MỤC", path: "/categories/meters", sortOrder: 607 },
    { pageKey: "system.users", pageName: "Quản lý Tài khoản", pageGroup: "HỆ THỐNG", path: "/users", sortOrder: 700 },
    { pageKey: "system.permissions", pageName: "Phân quyền", pageGroup: "HỆ THỐNG", path: "/admin/permissions", sortOrder: 701 },
    { pageKey: "system.backup", pageName: "Sao lưu & Phục hồi", pageGroup: "HỆ THỐNG", path: "/admin/backup", sortOrder: 702 },
    { pageKey: "system.feedback", pageName: "Góp ý & Đề xuất", pageGroup: "HỆ THỐNG", path: "/feedback", sortOrder: 703 },
  ];

  let created = 0;
  for (const p of pages) {
    const result = await prisma.pageRegistry.upsert({
      where: { pageKey: p.pageKey },
      update: {},
      create: p,
    });
    if (result) created++;
  }

  const finalCount = await prisma.pageRegistry.count();
  console.log(`✅ page_registry: ${finalCount} trang (đã upsert ${created} trang)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
