import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const processId = searchParams.get("processId");

  const where: Prisma.MachineWhereInput = {};
  if (factoryId) where.process = { factoryId: parseInt(factoryId) };
  if (processId) where.processId = parseInt(processId);

  const machines = await prisma.machine.findMany({
    where,
    include: {
      process: { include: { factory: true } },
      currentItem: true,
      currentLot: { select: { id: true, lotNumber: true } },
      currentSourceProcess: {
        select: {
          id: true,
          name: true,
          revenueFactory: { select: { id: true, name: true } },
        },
      },
      itemAssignments: {
        where: { isActive: true },
        include: {
          item: { select: { id: true, name: true } },
          lot: { select: { id: true, lotNumber: true } },
          sourceProcess: {
            select: {
              id: true,
              name: true,
              revenueFactory: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ processId: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(machines);
}

export async function POST(req: Request) {
  // ... (Code check quyền Admin tương tự các file khác) ...
  try {
    const body = await req.json();
    const newMachine = await prisma.machine.create({
      data: {
        name: body.name,
        processId: parseInt(body.processId),
        formulaType: parseInt(body.formulaType),
        spindleCount: body.spindleCount ? parseInt(body.spindleCount) : undefined,
        isActive: body.isActive !== false,
        currentNE: body.currentNE !== undefined && body.currentNE !== null && body.currentNE !== '' ? parseFloat(body.currentNE) : undefined,
        ...(body.model !== undefined && { model: body.model || null }),
        ...(body.allowMultiItemPerShift !== undefined && { allowMultiItemPerShift: body.allowMultiItemPerShift }),
        ...(body.currentSourceProcessId !== undefined && {
          currentSourceProcessId: body.currentSourceProcessId ? parseInt(body.currentSourceProcessId) : null,
        }),
      },
    });
    return NextResponse.json(newMachine);
  } catch (e: unknown) {
    console.error("Machine create error:", e);
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "Tên máy đã tồn tại. Vui lòng đặt tên khác." }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Lỗi tạo máy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
