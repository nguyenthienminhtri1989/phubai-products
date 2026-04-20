Thêm API recalculate + nút trên UI:
File mới: src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts
typescript// POST /api/kdsx/monthly-plans/[id]/recalculate
// Đọc lại tất cả PlanLineItem của plan → tra lại RawMaterialRate + MonthlyInputParam + SalesOrderItem.sellingCostRate → gọi calculateLineItem() → update lại snapshot
// Logic:
// 1. Load plan + all lineItems
// 2. Load inputParam cho (factoryId, yearMonth)
// 3. Với mỗi lineItem:
// a. Tra RawMaterialRate theo itemId (effectiveTo = null, orderBy effectiveFrom desc)
// b. Lấy sellingCostRate từ SalesOrderItem (nếu có salesOrderItemId) hoặc giữ nguyên
// c. Gọi calculateLineItem() với rates + params mới
// d. Update lineItem với kết quả mới
// 4. Gọi refreshSummarySnapshot()
// 5. Trả về { updated: số dòng đã tính lại }
File sửa: src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx
Thêm nút "Tính lại tất cả" ở toolbar:
tsx<Button
icon={<ReloadOutlined />}
onClick={async () => {
const res = await fetch(`/api/kdsx/monthly-plans/${planId}/recalculate`, { method: "POST" });
if (res.ok) {
const data = await res.json();
message.success(`Đã tính lại ${data.updated} dòng sợi`);
fetchData(); // reload trang
} else {
message.error("Lỗi tính lại");
}
}}

> Tính lại tất cả
> </Button>
