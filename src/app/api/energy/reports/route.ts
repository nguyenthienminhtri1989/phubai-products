import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const groupBy = searchParams.get("groupBy") || "day"; // "day" | "month"
    const factoryId = searchParams.get("factoryId");
    const substationId = searchParams.get("substationId");
    const meterId = searchParams.get("meterId");
    const meterGroupId = searchParams.get("meterGroupId");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate và endDate là bắt buộc" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Build meter filter
    const meterFilter: Record<string, unknown> = { isActive: true };
    if (factoryId) meterFilter.factoryId = parseInt(factoryId);
    if (substationId) meterFilter.substationId = parseInt(substationId);
    if (meterGroupId) meterFilter.meterGroupId = parseInt(meterGroupId);

    const where: Record<string, unknown> = {
      recordDate: { gte: start, lte: end },
    };
    if (meterId) {
      where.meterId = parseInt(meterId);
    } else {
      where.meter = meterFilter;
    }

    // Current period records
    const records = await prisma.powerRecord.findMany({
      where,
      include: {
        meter: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            factory: { select: { id: true, name: true } },
            substation: { select: { id: true, name: true } },
            meterGroup: { select: { id: true, groupCode: true, groupName: true } },
          },
        },
      },
      orderBy: { recordDate: "asc" },
    });

    // Previous period for trend comparison
    const daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);

    const prevWhere: Record<string, unknown> = {
      recordDate: { gte: prevStart, lte: prevEnd },
    };
    if (meterId) {
      prevWhere.meterId = parseInt(meterId);
    } else {
      prevWhere.meter = meterFilter;
    }

    const prevRecords = await prisma.powerRecord.findMany({
      where: prevWhere,
      select: { consTotal: true, costTotal: true },
    });

    // ── Summary ──────────────────────────────────────────────────────────────
    const totalConsumption = records.reduce((s, r) => s + (r.consTotal ?? 0), 0);
    const totalCost        = records.reduce((s, r) => s + (r.costTotal ?? 0), 0);
    const totalPeak        = records.reduce((s, r) => s + (r.consPeak ?? 0), 0);
    const totalNormal      = records.reduce((s, r) => s + (r.consNormal ?? 0), 0);
    const totalOffPeak     = records.reduce((s, r) => s + (r.consOffPeak ?? 0), 0);

    const uniqueDates  = new Set(records.map(r => r.recordDate.toISOString().slice(0, 10)));
    const daysWithData = uniqueDates.size;
    const avgPerDay    = daysWithData > 0 ? totalConsumption / daysWithData : 0;

    const prevTotalCons = prevRecords.reduce((s, r) => s + (r.consTotal ?? 0), 0);
    const trendPercent  = prevTotalCons > 0
      ? ((totalConsumption - prevTotalCons) / prevTotalCons) * 100
      : null;

    // ── By Date / Month ───────────────────────────────────────────────────────
    type DateBucket = {
      consTotal: number; consPeak: number;
      consNormal: number; consOffPeak: number; costTotal: number;
    };
    const dateMap = new Map<string, DateBucket>();

    for (const r of records) {
      const dateStr = r.recordDate.toISOString().slice(0, 10);
      const key = groupBy === "month" ? dateStr.slice(0, 7) : dateStr;
      if (!dateMap.has(key)) {
        dateMap.set(key, { consTotal: 0, consPeak: 0, consNormal: 0, consOffPeak: 0, costTotal: 0 });
      }
      const b = dateMap.get(key)!;
      b.consTotal   += r.consTotal   ?? 0;
      b.consPeak    += r.consPeak    ?? 0;
      b.consNormal  += r.consNormal  ?? 0;
      b.consOffPeak += r.consOffPeak ?? 0;
      b.costTotal   += r.costTotal   ?? 0;
    }

    const byDate = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // ── By Meter ──────────────────────────────────────────────────────────────
    type MeterBucket = {
      meterId: number; meterCode: string; meterName: string;
      meterType: number; groupName: string;
      factoryName: string; substationName: string;
      consTotal: number; costTotal: number;
    };
    const meterMap = new Map<number, MeterBucket>();

    for (const r of records) {
      if (!meterMap.has(r.meterId)) {
        meterMap.set(r.meterId, {
          meterId:       r.meterId,
          meterCode:     r.meter.code,
          meterName:     r.meter.name,
          meterType:     r.meter.type,
          groupName:     r.meter.meterGroup?.groupName ?? "Chưa phân nhóm",
          factoryName:   r.meter.factory.name,
          substationName: r.meter.substation?.name ?? "—",
          consTotal:     0,
          costTotal:     0,
        });
      }
      const b = meterMap.get(r.meterId)!;
      b.consTotal += r.consTotal ?? 0;
      b.costTotal += r.costTotal ?? 0;
    }
    const byMeter = Array.from(meterMap.values()).sort((a, b) => b.consTotal - a.consTotal);

    // ── By Group ──────────────────────────────────────────────────────────────
    type GroupBucket = {
      groupId: number | null; groupCode: string; groupName: string;
      consTotal: number; costTotal: number;
    };
    const groupMap = new Map<string, GroupBucket>();

    for (const r of records) {
      const key = r.meter.meterGroup?.id?.toString() ?? "none";
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          groupId:   r.meter.meterGroup?.id  ?? null,
          groupCode: r.meter.meterGroup?.groupCode ?? "—",
          groupName: r.meter.meterGroup?.groupName ?? "Chưa phân nhóm",
          consTotal: 0,
          costTotal: 0,
        });
      }
      const b = groupMap.get(key)!;
      b.consTotal += r.consTotal ?? 0;
      b.costTotal += r.costTotal ?? 0;
    }
    const byGroup = Array.from(groupMap.values()).sort((a, b) => b.consTotal - a.consTotal);

    return NextResponse.json({
      summary: {
        totalConsumption,
        totalCost,
        totalPeak,
        totalNormal,
        totalOffPeak,
        avgPerDay,
        daysWithData,
        prevPeriodConsumption: prevTotalCons,
        trendPercent,
      },
      byDate,
      byMeter,
      byGroup,
    });
  } catch (error) {
    console.error("[energy/reports]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
