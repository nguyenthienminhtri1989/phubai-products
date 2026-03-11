import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const processId = searchParams.get("processId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const userRole = session.user.role;
  const userProcessIds: number[] = (session.user as any).processIds || [];

  const machineWhere: any = {};
  if (processId) machineWhere.processId = parseInt(processId);
  if (factoryId) machineWhere.process = { factoryId: parseInt(factoryId) };
  if (userRole !== "ADMIN" && userProcessIds.length > 0) {
    machineWhere.processId = { in: userProcessIds };
  }

  const where: any = { machine: machineWhere };
  if (dateFrom || dateTo) {
    where.recordDate = {};
    if (dateFrom) where.recordDate.gte = new Date(dateFrom);
    if (dateTo) where.recordDate.lte = new Date(dateTo);
  }

  const logs = await prisma.machineStopLog.findMany({
    where,
    include: {
      category: true,
      machine: { select: { id: true, name: true } },
    },
  });

  const totalStops = logs.length;
  const totalDowntimeMinutes = logs.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);

  // Breakdown by category
  const catMap = new Map<number, { categoryId: number; categoryName: string; color: string; count: number; totalMinutes: number }>();
  for (const log of logs) {
    const key = log.categoryId;
    if (!catMap.has(key)) {
      catMap.set(key, { categoryId: key, categoryName: log.category.name, color: log.category.color, count: 0, totalMinutes: 0 });
    }
    const entry = catMap.get(key)!;
    entry.count++;
    entry.totalMinutes += log.durationMinutes ?? 0;
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Top 5 machines
  const machineMap = new Map<number, { machineId: number; machineName: string; count: number; totalMinutes: number }>();
  for (const log of logs) {
    const key = log.machineId;
    if (!machineMap.has(key)) {
      machineMap.set(key, { machineId: key, machineName: log.machine.name, count: 0, totalMinutes: 0 });
    }
    const entry = machineMap.get(key)!;
    entry.count++;
    entry.totalMinutes += log.durationMinutes ?? 0;
  }
  const topMachines = Array.from(machineMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5);

  return NextResponse.json({ totalStops, totalDowntimeMinutes, byCategory, topMachines });
}
