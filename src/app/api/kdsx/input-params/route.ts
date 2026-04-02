import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const yearMonth = searchParams.get("yearMonth");

  if (!factoryId || !yearMonth) {
    return NextResponse.json({ error: "Cần factoryId và yearMonth" }, { status: 400 });
  }

  const param = await prisma.monthlyInputParam.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: Number(factoryId),
        yearMonth,
      },
    },
  });
  return NextResponse.json(param);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { factoryId, yearMonth, ...rest } = body;
  if (!factoryId || !yearMonth) {
    return NextResponse.json({ error: "Cần factoryId và yearMonth" }, { status: 400 });
  }

  // Tính bông bình quân nếu chưa có
  let avgCottonPrice = rest.avgCottonPrice;
  if (!avgCottonPrice) {
    const { cottonUsaPrice = 0, cottonBrazilPrice = 0, cottonAusPrice = 0,
            cottonUsaRatio = 0, cottonBrazilRatio = 0, cottonAusRatio = 0,
            warehouseFee = 0.02 } = rest;
    const totalRatio = (cottonUsaRatio || 0) + (cottonBrazilRatio || 0) + (cottonAusRatio || 0);
    if (totalRatio > 0) {
      avgCottonPrice =
        ((cottonUsaPrice || 0) * (cottonUsaRatio || 0) +
          (cottonBrazilPrice || 0) * (cottonBrazilRatio || 0) +
          (cottonAusPrice || 0) * (cottonAusRatio || 0)) /
          totalRatio + (warehouseFee || 0);
    }
  }

  const param = await prisma.monthlyInputParam.upsert({
    where: {
      factoryId_yearMonth: { factoryId: Number(factoryId), yearMonth },
    },
    create: {
      factoryId: Number(factoryId),
      yearMonth,
      ...rest,
      avgCottonPrice: avgCottonPrice ?? null,
    },
    update: {
      ...rest,
      avgCottonPrice: avgCottonPrice ?? null,
    },
  });
  return NextResponse.json(param);
}
