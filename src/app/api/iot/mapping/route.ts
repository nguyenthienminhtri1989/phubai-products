import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const sourceId = parseInt(searchParams.get("sourceId") || "0");
    if (!sourceId) return NextResponse.json({ error: "sourceId bắt buộc" }, { status: 400 });

    const [source, machineMaps, itemMaps] = await Promise.all([
      prisma.iotSource.findUnique({ where: { id: sourceId } }),
      prisma.iotMachineMap.findMany({
        where: { sourceId },
        include: { machine: { select: { id: true, name: true } } },
        orderBy: { iotName: "asc" },
      }),
      prisma.iotItemMap.findMany({
        where: { sourceId },
        include: { item: { select: { id: true, name: true } } },
        orderBy: { iotName: "asc" },
      }),
    ]);

    if (!source) return NextResponse.json({ error: "Không tìm thấy nguồn IoT" }, { status: 404 });

    return NextResponse.json({ source, machineMaps, itemMaps });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải mapping" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const _ur = (session.user as any)?.userRole as string | undefined;
    if (!_ur || !["ADMIN", "DIRECTOR", "FACTORY_MANAGER"].includes(_ur)) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const body = await req.json();
    const { sourceId, machineMaps, itemMaps, shiftMap, skipItems } = body as {
      sourceId: number;
      machineMaps: { iotName: string; machineId: number }[];
      itemMaps: { iotName: string; itemId: number }[];
      shiftMap: Record<string, number>;
      skipItems?: string[];
    };

    if (!sourceId) return NextResponse.json({ error: "sourceId bắt buộc" }, { status: 400 });

    const ops: any[] = [];

    // Upsert machine maps
    for (const m of machineMaps || []) {
      ops.push(
        prisma.iotMachineMap.upsert({
          where: { sourceId_iotName: { sourceId, iotName: m.iotName } },
          update: { machineId: m.machineId },
          create: { sourceId, iotName: m.iotName, machineId: m.machineId },
        })
      );
    }

    // Upsert item maps
    for (const i of itemMaps || []) {
      ops.push(
        prisma.iotItemMap.upsert({
          where: { sourceId_iotName: { sourceId, iotName: i.iotName } },
          update: { itemId: i.itemId },
          create: { sourceId, iotName: i.iotName, itemId: i.itemId },
        })
      );
    }

    // Update shiftMap và skipItems
    ops.push(
      (prisma.iotSource.update as any)({
        where: { id: sourceId },
        data: {
          shiftMap: shiftMap || {},
          ...(skipItems !== undefined && { skipItems }),
        },
      })
    );

    await prisma.$transaction(ops);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi lưu mapping" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const _ur = (session.user as any)?.userRole as string | undefined;
    if (!_ur || !["ADMIN", "DIRECTOR", "FACTORY_MANAGER"].includes(_ur)) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const body = await req.json();
    const { type, id } = body as { type: "machine" | "item"; id: number };

    if (type === "machine") {
      await prisma.iotMachineMap.delete({ where: { id } });
    } else if (type === "item") {
      await prisma.iotItemMap.delete({ where: { id } });
    } else {
      return NextResponse.json({ error: "type phải là machine hoặc item" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi xóa mapping" }, { status: 500 });
  }
}
