File: src/app/kdsx/sales-orders/page.tsx
Bỏ điều kiện {!editing && (...)} bọc quanh phần Form.List items — cho hiện cả khi tạo mới lẫn khi sửa:
tsx// CŨ:
{!editing && (
<>

<Title level={5}>Chi tiết sợi trong HĐ</Title>
<Form.List name="items">
...
</Form.List>
</>
)}

// MỚI: bỏ điều kiện, luôn hiện
<>

  <Title level={5}>Chi tiết sợi trong HĐ</Title>
  <Form.List name="items">
    ...
  </Form.List>
</>
File: src/app/api/kdsx/sales-orders/[id]/route.ts
Kiểm tra handler PUT có xử lý cập nhật items không. Nếu chưa có thì thêm logic: xóa items cũ rồi tạo lại từ body (hoặc upsert). Đơn giản nhất:
typescript// Trong handler PUT, sau khi update SalesOrder:
if (body.items && Array.isArray(body.items)) {
  // Xóa items cũ
  await prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
  // Tạo lại từ body
  await prisma.salesOrderItem.createMany({
    data: body.items.map((item: any) => ({
      orderId: id,
      itemId: item.itemId,
      plannedQty: item.plannedQty,
      unitPrice: item.unitPrice,
      sellingCostRate: item.sellingCostRate ?? null,
      note: item.note ?? null,
    })),
  });
}
