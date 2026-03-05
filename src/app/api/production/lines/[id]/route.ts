// === FILE: src/app/api/production/lines/[id]/route.ts ===
// PHIEN BAN CAP NHAT: Them chuc nang sua line (cap nhat lien ket)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. GET: Lay chi tiet 1 line
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const line = await prisma.productionLine.findUnique({
      where: { id: parseInt(id) },
      include: {
        item: true,
        factory: true,
        createdBy: { select: { fullName: true } },
        links: {
          include: {
            fromMachine: { include: { process: true } },
            toMachine: { include: { process: true } },
          },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    if (!line)
      return NextResponse.json({ error: "Khong tim thay" }, { status: 404 });

    return NextResponse.json(line);
  } catch (error) {
    return NextResponse.json({ error: "Loi server" }, { status: 500 });
  }
}

// 2. PUT: Cap nhat line (sua ten, loai tuyen, lien ket)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Chua dang nhap" }, { status: 401 });
    }
    if (
      session.user.role !== "ADMIN" &&
      session.user.accessLevel !== "MANAGER"
    ) {
      return NextResponse.json({ error: "Khong co quyen" }, { status: 403 });
    }

    const { id } = await params;
    const lineId = parseInt(id);
    const body = await request.json();

    // Neu chi dong line (chi co endDate)
    if (body.endDate && !body.links) {
      const updated = await prisma.productionLine.update({
        where: { id: lineId },
        data: { endDate: new Date(body.endDate) },
      });
      return NextResponse.json(updated);
    }

    // Cap nhat day du (ten, loai tuyen, lien ket)
    const { name, routeType, links } = body;

    const result = await prisma.$transaction(async (tx) => {
      // Cap nhat thong tin co ban
      const updateData: any = {};
      if (name) updateData.name = name;
      if (routeType) updateData.routeType = parseInt(routeType);

      if (Object.keys(updateData).length > 0) {
        await tx.productionLine.update({
          where: { id: lineId },
          data: updateData,
        });
      }

      // Cap nhat lien ket: Xoa het cu, tao lai moi
      if (links && Array.isArray(links)) {
        // Xoa lien ket cu
        await tx.productionLineLink.deleteMany({
          where: { lineId },
        });

        // Tao lien ket moi
        if (links.length > 0) {
          await tx.productionLineLink.createMany({
            data: links.map((link: any, index: number) => ({
              lineId,
              fromMachineId: parseInt(link.fromMachineId),
              toMachineId: parseInt(link.toMachineId),
              stepOrder: link.stepOrder || index + 1,
            })),
          });
        }
      }

      // Tra ve line da cap nhat
      return tx.productionLine.findUnique({
        where: { id: lineId },
        include: {
          item: true,
          factory: true,
          links: {
            include: {
              fromMachine: { include: { process: true } },
              toMachine: { include: { process: true } },
            },
            orderBy: { stepOrder: "asc" },
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PUT Line Error:", error);
    return NextResponse.json({ error: "Loi cap nhat line" }, { status: 500 });
  }
}

// 3. DELETE: Xoa line
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Chi Admin duoc xoa" },
        { status: 403 },
      );
    }

    const { id } = await params;

    await prisma.productionLine.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ message: "Da xoa" });
  } catch (error) {
    return NextResponse.json({ error: "Loi xoa" }, { status: 500 });
  }
}
