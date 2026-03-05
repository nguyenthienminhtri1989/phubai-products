// === FILE: src/app/api/production/lines/route.ts ===

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. GET: Lay danh sach line (co loc theo factory, ngay, trang thai)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const factoryId = searchParams.get("factoryId");
    const dateStr = searchParams.get("date");
    const activeOnly = searchParams.get("activeOnly") !== "false"; // Mac dinh chi lay line dang hieu luc

    const where: any = {};

    if (factoryId) where.factoryId = parseInt(factoryId);

    if (dateStr) {
      const targetDate = new Date(dateStr);
      where.startDate = { lte: targetDate };
      where.OR = [
        { endDate: null }, // Dang hieu luc
        { endDate: { gte: targetDate } }, // Hoac chua het han tai thoi diem do
      ];
    } else if (activeOnly) {
      where.endDate = null; // Chi lay line dang hieu luc
    }

    const lines = await prisma.productionLine.findMany({
      where,
      include: {
        item: true,
        factory: true,
        createdBy: { select: { fullName: true } },
        links: {
          include: {
            fromMachine: {
              include: { process: true },
            },
            toMachine: {
              include: { process: true },
            },
          },
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(lines);
  } catch (error) {
    console.error("GET Lines Error:", error);
    return NextResponse.json(
      { error: "Loi tai danh sach line" },
      { status: 500 },
    );
  }
}

// 2. POST: Tao line moi
export async function POST(request: Request) {
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

    const body = await request.json();
    const { name, itemId, factoryId, routeType, startDate, links } = body;

    // Validate
    if (
      !name ||
      !itemId ||
      !factoryId ||
      !startDate ||
      !links ||
      links.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Thieu thong tin: Ten line, Mat hang, Nha may, Ngay bat dau, va Lien ket may",
        },
        { status: 400 },
      );
    }

    // Transaction: Dong line cu cung mat hang/nha may (neu co) + Tao line moi
    const result = await prisma.$transaction(async (tx) => {
      // Dong cac line cu cung nha may + mat hang dang hieu luc
      await tx.productionLine.updateMany({
        where: {
          factoryId: parseInt(factoryId),
          itemId: parseInt(itemId),
          endDate: null, // Chi dong line dang hieu luc
        },
        data: {
          endDate: new Date(startDate), // Dong lai vao ngay bat dau line moi
        },
      });

      // Tao line moi
      const newLine = await tx.productionLine.create({
        data: {
          name,
          itemId: parseInt(itemId),
          factoryId: parseInt(factoryId),
          routeType: parseInt(routeType) || 1,
          startDate: new Date(startDate),
          createdById: parseInt(session.user.id!),
          links: {
            create: links.map((link: any, index: number) => ({
              fromMachineId: parseInt(link.fromMachineId),
              toMachineId: parseInt(link.toMachineId),
              stepOrder: link.stepOrder || index + 1,
            })),
          },
        },
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

      return newLine;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST Line Error:", error);
    return NextResponse.json(
      { error: "Loi tao line: " + error },
      { status: 500 },
    );
  }
}
