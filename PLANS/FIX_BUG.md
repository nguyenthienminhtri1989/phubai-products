File: src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts
Tìm chỗ query SalesOrderItem (khoảng dòng 91), thêm sellingCostRate vào select:
typescript// Tìm đoạn query salesOrderItem, thêm sellingCostRate vào select
const soItem = await prisma.salesOrderItem.findUnique({
where: { id: ... },
select: {
id: true,
orderId: true,
itemId: true,
plannedQty: true,
unitPrice: true,
allocatedQty: true,
deliveryDate: true,
note: true,
sellingCostRate: true, // THÊM DÒNG NÀY
},
});
