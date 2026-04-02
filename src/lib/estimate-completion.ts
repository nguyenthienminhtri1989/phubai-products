import { prisma } from '@/lib/prisma'

/**
 * Ước tính ngày hoàn thành dựa trên:
 * - Định mức năng suất (ProductivityBenchmark) của mặt hàng tại nhà máy
 * - Số máy đang chạy mặt hàng đó
 * - 3 ca / ngày
 */
export async function calcEstimatedDoneDate(
  itemId: number,
  factoryId: number,
  remainingQty: number,
): Promise<Date | null> {
  if (remainingQty <= 0) return null

  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      itemId,
      process: { factoryId },
      version: { isActive: true },
    },
  })
  if (!benchmark) return null

  const machineCount = await prisma.machine.count({
    where: {
      process: { factoryId },
      currentItemId: itemId,
      isActive: true,
    },
  })
  if (machineCount === 0) return null

  const dailyOutput = benchmark.stdOutputPerShift * machineCount * 3 // 3 ca/ngày
  if (dailyOutput <= 0) return null

  const daysNeeded = Math.ceil(remainingQty / dailyOutput)
  const estimated = new Date()
  estimated.setDate(estimated.getDate() + daysNeeded)
  return estimated
}
