import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const factoryId = searchParams.get("factoryId");
    const processId = searchParams.get("processId");
    const machineIdsParam = searchParams.get("machineIds");
    const itemIdsParam = searchParams.get("itemIds");
    const shiftsParam = searchParams.get("shifts");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Thiếu khoảng thời gian" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    // Include end date fully
    end.setHours(23, 59, 59, 999);

    const machineIds = machineIdsParam
      ? machineIdsParam.split(",").map((v) => parseInt(v)).filter(Boolean)
      : [];
    const itemIds = itemIdsParam
      ? itemIdsParam.split(",").map((v) => parseInt(v)).filter(Boolean)
      : [];
    const shifts = shiftsParam
      ? shiftsParam.split(",").map((v) => parseInt(v)).filter(Boolean)
      : [];

    // Build machine filter
    let machineFilter: any = {};
    if (machineIds.length > 0) {
      machineFilter = { machineId: { in: machineIds } };
    } else if (processId) {
      machineFilter = { machine: { processId: parseInt(processId) } };
    } else if (factoryId) {
      machineFilter = { machine: { process: { factoryId: parseInt(factoryId) } } };
    }

    const where: any = {
      recordDate: { gte: start, lte: end },
      ...machineFilter,
    };

    if (itemIds.length > 0) where.itemId = { in: itemIds };
    if (shifts.length > 0) where.shift = { in: shifts };

    // Fetch all raw logs for aggregation
    const logs = await prisma.productionLog.findMany({
      where,
      select: {
        recordDate: true,
        shift: true,
        finalOutput: true,
        efficiency: true,
        machineId: true,
        itemId: true,
        machine: {
          select: {
            name: true,
            process: { select: { name: true } },
          },
        },
        item: { select: { name: true, code: true } },
      },
      orderBy: { recordDate: "asc" },
    });

    // --- BY DATE --- (kèm hiệu suất TB có trọng số theo ngày)
    const dateMap = new Map<string, {
      total: number; shift1: number; shift2: number; shift3: number;
      wEffSum: number; wEffBase: number;
    }>();
    for (const log of logs) {
      const dateStr = log.recordDate.toISOString().slice(0, 10);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { total: 0, shift1: 0, shift2: 0, shift3: 0, wEffSum: 0, wEffBase: 0 });
      }
      const entry = dateMap.get(dateStr)!;
      entry.total += log.finalOutput;
      if (log.shift === 1) entry.shift1 += log.finalOutput;
      else if (log.shift === 2) entry.shift2 += log.finalOutput;
      else if (log.shift === 3) entry.shift3 += log.finalOutput;
      // Hiệu suất: chỉ tính ca nào có nhập và sản lượng > 0
      if (log.efficiency != null && log.finalOutput > 0) {
        entry.wEffSum += log.finalOutput * log.efficiency;
        entry.wEffBase += log.finalOutput;
      }
    }
    const byDate = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        total: Math.round(data.total * 100) / 100,
        shift1: Math.round(data.shift1 * 100) / 100,
        shift2: Math.round(data.shift2 * 100) / 100,
        shift3: Math.round(data.shift3 * 100) / 100,
        // avgEfficiency: null nếu ngày đó chưa có ca nào nhập hiệu suất
        avgEfficiency: data.wEffBase > 0
          ? Math.round((data.wEffSum / data.wEffBase) * 10) / 10
          : null,
      }));

    // --- BY MACHINE ---
    const machineMap = new Map<number, { machineName: string; processName: string; total: number }>();
    for (const log of logs) {
      if (!machineMap.has(log.machineId)) {
        machineMap.set(log.machineId, {
          machineName: log.machine.name,
          processName: log.machine.process.name,
          total: 0,
        });
      }
      machineMap.get(log.machineId)!.total += log.finalOutput;
    }
    const byMachine = Array.from(machineMap.entries())
      .map(([machineId, data]) => ({
        machineId,
        machineName: data.machineName,
        processName: data.processName,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    // --- BY ITEM ---
    const itemMap = new Map<number, { itemName: string; itemCode: string | null; total: number }>();
    for (const log of logs) {
      if (!itemMap.has(log.itemId)) {
        itemMap.set(log.itemId, {
          itemName: log.item.name,
          itemCode: log.item.code ?? null,
          total: 0,
        });
      }
      itemMap.get(log.itemId)!.total += log.finalOutput;
    }
    const byItem = Array.from(itemMap.entries())
      .map(([itemId, data]) => ({
        itemId,
        itemName: data.itemName,
        itemCode: data.itemCode,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    // --- SUMMARY ---
    const grandTotal = logs.reduce((sum, l) => sum + l.finalOutput, 0);
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTotal = logs
      .filter((l) => l.recordDate.toISOString().slice(0, 10) === todayStr)
      .reduce((sum, l) => sum + l.finalOutput, 0);
    const daysWithData = dateMap.size;
    const avgPerDay = daysWithData > 0 ? grandTotal / daysWithData : 0;

    // Hiệu suất TB toàn kỳ (trọng số sản lượng, chỉ tính ca có nhập)
    let allWEffSum = 0, allWEffBase = 0;
    for (const log of logs) {
      if (log.efficiency != null && log.finalOutput > 0) {
        allWEffSum += log.finalOutput * log.efficiency;
        allWEffBase += log.finalOutput;
      }
    }
    const avgEfficiency = allWEffBase > 0
      ? Math.round((allWEffSum / allWEffBase) * 10) / 10
      : null;

    return NextResponse.json({
      byDate,
      byMachine,
      byItem,
      summary: {
        grandTotal: Math.round(grandTotal * 100) / 100,
        todayTotal: Math.round(todayTotal * 100) / 100,
        avgPerDay: Math.round(avgPerDay * 100) / 100,
        daysWithData,
        avgEfficiency, // % TB toàn kỳ, null nếu chưa có dữ liệu
      },
    });
  } catch (error) {
    console.error("Production Report Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
