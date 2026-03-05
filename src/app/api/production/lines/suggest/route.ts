// === FILE: src/app/api/production/lines/suggest/route.ts ===
// API goi y line tu dong dua tren mat hang dang chay

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const factoryId = searchParams.get("factoryId");

    if (!itemId || !factoryId) {
      return NextResponse.json(
        { error: "Thieu itemId hoac factoryId" },
        { status: 400 },
      );
    }

    // Tim tat ca may dang chay cung mat hang trong nha may nay
    const machines = await prisma.machine.findMany({
      where: {
        currentItemId: parseInt(itemId),
        isActive: true,
        process: { factoryId: parseInt(factoryId) },
      },
      include: {
        process: true,
        currentItem: true,
      },
      orderBy: [{ processId: "asc" }, { id: "asc" }],
    });

    // Nhom may theo cong doan
    const grouped: Record<string, any[]> = {};
    machines.forEach((m) => {
      const processName = m.process?.name || "Khac";
      if (!grouped[processName]) grouped[processName] = [];
      grouped[processName].push({
        id: m.id,
        name: m.name,
        processId: m.processId,
        processName: processName,
      });
    });

    return NextResponse.json({
      machines,
      grouped,
      total: machines.length,
    });
  } catch (error) {
    console.error("Suggest Error:", error);
    return NextResponse.json({ error: "Loi goi y" }, { status: 500 });
  }
}
