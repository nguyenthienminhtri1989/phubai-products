import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Chua dang nhap" }, { status: 401 });
    }

    const { id } = await params;
    const machineId = parseInt(id, 10);
    if (isNaN(machineId)) {
      return NextResponse.json({ error: "ID may khong hop le" }, { status: 400 });
    }

    const body = await req.json();
    const data: Prisma.MachineUncheckedUpdateInput = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.processId !== undefined) data.processId = parseInt(body.processId, 10);
    if (body.formulaType !== undefined) data.formulaType = parseInt(body.formulaType, 10);
    if (body.spindleCount !== undefined) data.spindleCount = body.spindleCount;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.currentNE !== undefined) {
      data.currentNE =
        body.currentNE === null || body.currentNE === ""
          ? null
          : parseFloat(body.currentNE);
    }
    if (body.model !== undefined) data.model = body.model || null;
    if (body.allowMultiItemPerShift !== undefined) {
      data.allowMultiItemPerShift = body.allowMultiItemPerShift;
    }
    if (body.currentLotId !== undefined) {
      data.currentLotId = body.currentLotId ? parseInt(body.currentLotId, 10) : null;
    }
    if (body.currentSourceProcessId !== undefined) {
      const sourceId = body.currentSourceProcessId
        ? parseInt(body.currentSourceProcessId, 10)
        : null;
      if (sourceId) {
        const sourceProcess = await prisma.process.findFirst({
          where: { id: sourceId, revenueFactoryId: { not: null } },
          select: { id: true },
        });
        if (!sourceProcess) {
          return NextResponse.json(
            { error: "Nguon soi khong hop le" },
            { status: 400 },
          );
        }
      }
      data.currentSourceProcessId = sourceId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Khong co du lieu can cap nhat" },
        { status: 400 },
      );
    }

    const updated = await prisma.machine.update({
      where: { id: machineId },
      data,
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
      },
    });
    return NextResponse.json(updated);
  } catch (e: unknown) {
    console.error("Machine update error:", e);
    return NextResponse.json({ error: "Loi cap nhat" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const user = session?.user as { userRole?: string } | undefined;
    if (user?.userRole !== "ADMIN") {
      return NextResponse.json({ error: "Chi Admin moi duoc xoa may" }, { status: 403 });
    }

    const { id } = await params;
    const machineId = parseInt(id, 10);
    if (isNaN(machineId)) {
      return NextResponse.json({ error: "ID may khong hop le" }, { status: 400 });
    }

    const count = await prisma.productionLog.count({
      where: { machineId },
    });
    if (count > 0) {
      return NextResponse.json(
        {
          error:
            "May da co du lieu san xuat, chi duoc phep tat hoat dong chu khong the xoa.",
        },
        { status: 400 },
      );
    }

    await prisma.machine.delete({ where: { id: machineId } });
    return NextResponse.json({ message: "Da xoa" });
  } catch (e: unknown) {
    console.error("Machine delete error:", e);
    return NextResponse.json({ error: "Loi xoa" }, { status: 500 });
  }
}
