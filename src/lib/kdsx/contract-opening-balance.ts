import { prisma } from "@/lib/prisma";

interface ContractRemainingInput {
  salesOrderItemId: number;
  factoryId: number;
  processId?: number;
  yearMonth: string;
  firstDayOfMonth: Date;
  plannedQty: number;
  deliveredQty: number;
}

export interface ContractRemainingContext {
  cumProducedPrevMonths: number;
  remainingTotal: number;
  openingBalance: {
    id: number;
    openingYearMonth: string;
    producedBeforeKg: number;
    note: string | null;
  } | null;
}

function firstDayFromYearMonth(yearMonth: string) {
  return new Date(`${yearMonth}-01T00:00:00.000Z`);
}

/**
 * Tính phần đã xử lý trước tháng hiện tại cho một dòng HĐ.
 *
 * Nếu có ContractOpeningBalance (kỳ mở sổ) thì dùng số dư đầu kỳ thay cho
 * allocation lịch sử trước kỳ đó. Đây là điểm cắt để tách dữ liệu Excel/quá khứ
 * khỏi logic MonthlyQuota từ tháng bắt đầu áp dụng phần mềm.
 */
export async function getContractRemainingContext(
  input: ContractRemainingInput,
): Promise<ContractRemainingContext> {
  const openingBalance = input.processId
    ? await prisma.contractOpeningBalance.findFirst({
        where: {
          salesOrderItemId: input.salesOrderItemId,
          factoryId: input.factoryId,
          processId: input.processId,
          openingYearMonth: { lte: input.yearMonth },
        },
        orderBy: { openingYearMonth: "desc" },
      })
    : null;

  let cumProducedPrevMonths: number;

  if (openingBalance) {
    const openingFirstDay = firstDayFromYearMonth(
      openingBalance.openingYearMonth,
    );
    const allocatedAfterOpening = await prisma.orderAllocation.aggregate({
      where: {
        salesOrderItemId: input.salesOrderItemId,
        productionDate: {
          gte: openingFirstDay,
          lt: input.firstDayOfMonth,
        },
      },
      _sum: { allocatedQty: true },
    });
    cumProducedPrevMonths =
      openingBalance.producedBeforeKg +
      (allocatedAfterOpening._sum?.allocatedQty ?? 0);
  } else {
    const prevAllocated = await prisma.orderAllocation.aggregate({
      where: {
        salesOrderItemId: input.salesOrderItemId,
        productionDate: { lt: input.firstDayOfMonth },
      },
      _sum: { allocatedQty: true },
    });
    cumProducedPrevMonths = prevAllocated._sum?.allocatedQty ?? 0;
  }

  const remainingTotal = Math.max(
    0,
    input.plannedQty - input.deliveredQty - cumProducedPrevMonths,
  );

  return {
    cumProducedPrevMonths,
    remainingTotal,
    openingBalance: openingBalance
      ? {
          id: openingBalance.id,
          openingYearMonth: openingBalance.openingYearMonth,
          producedBeforeKg: openingBalance.producedBeforeKg,
          note: openingBalance.note,
        }
      : null,
  };
}
