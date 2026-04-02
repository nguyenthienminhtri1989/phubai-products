import { prisma } from '@/lib/prisma'

/**
 * Phân bổ sản lượng 1 ngày vào các hợp đồng theo waterfall deadline.
 * Idempotent — chạy lại cùng ngày cho kết quả giống nhau.
 */
export async function runAllocation(factoryId: number, date: Date) {
  // 1. Tổng sản lượng theo mặt hàng trong ngày
  const dailyOutput = await prisma.productionLog.groupBy({
    by: ['itemId'],
    where: {
      machine: { process: { factoryId } },
      recordDate: date,
    },
    _sum: { finalOutput: true },
  })

  for (const { itemId, _sum } of dailyOutput) {
    const totalProduced = _sum.finalOutput ?? 0
    if (totalProduced <= 0) continue

    // 2. Undo existing allocations for this date (idempotent)
    const existingAllocs = await prisma.orderAllocation.findMany({
      where: { productionDate: date, factoryId, itemId },
      select: { salesOrderItemId: true, allocatedQty: true },
    })

    if (existingAllocs.length > 0) {
      // Tính tổng cần trừ cho từng SalesOrderItem
      const decrements = new Map<number, number>()
      for (const a of existingAllocs) {
        decrements.set(
          a.salesOrderItemId,
          (decrements.get(a.salesOrderItemId) ?? 0) + a.allocatedQty,
        )
      }

      // Xóa allocations cũ + trừ lại allocatedQty trong 1 transaction
      await prisma.$transaction([
        prisma.orderAllocation.deleteMany({
          where: { productionDate: date, factoryId, itemId },
        }),
        ...Array.from(decrements.entries()).map(([id, qty]) =>
          prisma.salesOrderItem.update({
            where: { id },
            data: { allocatedQty: { decrement: qty } },
          }),
        ),
      ])

      // Reset DONE orders về ACTIVE (có thể không còn đủ sau khi undo)
      const affectedOrders = await prisma.salesOrderItem.findMany({
        where: { id: { in: Array.from(decrements.keys()) } },
        select: { orderId: true },
      })
      const orderIds = [...new Set(affectedOrders.map((i) => i.orderId))]
      if (orderIds.length > 0) {
        await prisma.salesOrder.updateMany({
          where: { id: { in: orderIds }, status: 'DONE' },
          data: { status: 'ACTIVE', completedDate: null },
        })
      }
    }

    // 3. HĐ cần mặt hàng này, chưa xong, ưu tiên deadline sớm nhất
    // Fetch SAU khi undo để có allocatedQty chính xác
    const pendingItems = await prisma.salesOrderItem.findMany({
      where: {
        itemId,
        order: {
          factoryId,
          status: { in: ['ACTIVE', 'OVERDUE'] },
        },
      },
      include: { order: true },
      orderBy: [
        { order: { deliveryDate: 'asc' } },
        { plannedQty: 'asc' }, // cùng deadline → ưu tiên HĐ gần xong trước
      ],
    })

    // 4. Waterfall
    let remaining = totalProduced

    for (const orderItem of pendingItems) {
      if (remaining <= 0) break

      const stillNeeded = orderItem.plannedQty - orderItem.allocatedQty
      if (stillNeeded <= 0) continue

      const toAllocate = Math.min(remaining, stillNeeded)

      await prisma.$transaction([
        prisma.orderAllocation.create({
          data: {
            salesOrderItemId: orderItem.id,
            productionDate: date,
            factoryId,
            itemId,
            allocatedQty: toAllocate,
          },
        }),
        prisma.salesOrderItem.update({
          where: { id: orderItem.id },
          data: { allocatedQty: { increment: toAllocate } },
        }),
      ])

      // Kiểm tra HĐ đã hoàn thành chưa
      const updatedItem = await prisma.salesOrderItem.findUnique({
        where: { id: orderItem.id },
      })
      if (updatedItem && updatedItem.allocatedQty >= orderItem.plannedQty) {
        const allDone = await checkAllItemsDone(orderItem.orderId)
        if (allDone) {
          await prisma.salesOrder.update({
            where: { id: orderItem.orderId },
            data: { status: 'DONE', completedDate: new Date() },
          })
        }
      }

      remaining -= toAllocate
    }
  }

  // 5. Flag OVERDUE — quá deadline mà chưa xong
  await prisma.salesOrder.updateMany({
    where: {
      factoryId,
      status: 'ACTIVE',
      deliveryDate: { lt: new Date() },
    },
    data: { status: 'OVERDUE' },
  })
}

async function checkAllItemsDone(salesOrderId: number): Promise<boolean> {
  const items = await prisma.salesOrderItem.findMany({
    where: { orderId: salesOrderId },
  })
  return items.every((item) => item.allocatedQty >= item.plannedQty)
}

/**
 * Tính lại toàn bộ allocation từ đầu cho 1 nhà máy trong khoảng thời gian.
 * Dùng khi cần recalculate (ví dụ: sửa ProductionLog cũ).
 */
export async function recalculateAllocation(
  factoryId: number,
  fromDate: Date,
  toDate: Date,
) {
  // Reset allocatedQty về 0
  await prisma.salesOrderItem.updateMany({
    where: { order: { factoryId } },
    data: { allocatedQty: 0 },
  })

  // Reset status về ACTIVE (trừ CANCELLED)
  await prisma.salesOrder.updateMany({
    where: { factoryId, status: { in: ['DONE', 'OVERDUE'] } },
    data: { status: 'ACTIVE', completedDate: null },
  })

  // Xóa toàn bộ allocation trong khoảng
  await prisma.orderAllocation.deleteMany({
    where: {
      factoryId,
      productionDate: { gte: fromDate, lte: toDate },
    },
  })

  // Chạy lại từng ngày theo thứ tự
  const current = new Date(fromDate)
  while (current <= toDate) {
    await runAllocation(factoryId, new Date(current))
    current.setDate(current.getDate() + 1)
  }
}
