/**
 * POST /api/iot/parse-excel
 *
 * Dispatcher: đọc fileFormat của IotSource rồi chuyển sang sub-parser tương ứng.
 * Mọi sub-parser đều trả về cùng 1 cấu trúc ParseResult — wizard frontend không thay đổi.
 *
 * Thêm định dạng mới:
 *   1. Tạo src/lib/iot-parsers/parser-xxx.ts
 *   2. Thêm case "XXX" vào switch bên dưới
 *   3. Thêm enum IotFileFormat trong schema.prisma
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { LookupMaps } from "@/lib/iot-parsers/types";
import { parseStandard } from "@/lib/iot-parsers/parser-standard";
import { parseDanhOng } from "@/lib/iot-parsers/parser-danh-ong";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (
      !["ADMIN","DIRECTOR","FACTORY_MANAGER"].includes((session.user as any)?.userRole)
    )
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceIdStr = formData.get("sourceId") as string | null;

    if (!file) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    if (!sourceIdStr) return NextResponse.json({ error: "Thiếu sourceId" }, { status: 400 });

    const sourceId = parseInt(sourceIdStr);

    // Load tất cả data cần thiết 1 lần
    const [source, allMachines, allItems] = await Promise.all([
      prisma.iotSource.findUnique({
        where: { id: sourceId },
        include: {
          machineMaps: { include: { machine: { select: { id: true, name: true } } } },
          itemMaps: { include: { item: { select: { id: true, name: true } } } },
        },
      }),
      prisma.machine.findMany({ select: { id: true, name: true } }),
      prisma.item.findMany({ select: { id: true, name: true } }),
    ]);

    if (!source)
      return NextResponse.json({ error: "Không tìm thấy nguồn IoT" }, { status: 404 });

    // Build lookup maps
    const machineMapByIot: Record<string, { id: number; name: string }> = {};
    for (const m of source.machineMaps) {
      machineMapByIot[m.iotName] = { id: m.machineId, name: m.machine.name };
    }
    const itemMapByIot: Record<string, { id: number; name: string }> = {};
    for (const i of source.itemMaps) {
      itemMapByIot[i.iotName] = { id: i.itemId, name: i.item.name };
    }
    const machineByErpName: Record<string, { id: number; name: string }> = {};
    for (const m of allMachines) machineByErpName[m.name] = m;
    const itemByErpName: Record<string, { id: number; name: string }> = {};
    for (const i of allItems) itemByErpName[i.name] = i;

    const shiftMap = (source.shiftMap as Record<string, number>) ?? {};
    const skipItemsArr = ((source as any).skipItems as string[]) ?? [];
    const skipItems = new Set<string>(skipItemsArr);

    // Đọc file buffer
    const buffer = await file.arrayBuffer();

    // Batch load existing logs sau khi có buffer (cần parse trước để biết date range)
    // → existingLogSet sẽ được build sau khi parse xong preRows, truyền vào maps
    // Để đơn giản: load tất cả logs trong 90 ngày gần nhất thay vì date range cụ thể
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const existingLogs = await prisma.productionLog.findMany({
      where: { recordDate: { gte: since } },
      select: { machineId: true, recordDate: true, shift: true, itemId: true },
    });
    const existingLogSet = new Set(
      existingLogs.map(
        (l) =>
          `${l.machineId}_${l.recordDate.toISOString().split("T")[0]}_${l.shift}_${l.itemId}`
      )
    );

    const maps: LookupMaps = {
      machineMapByIot,
      itemMapByIot,
      machineByErpName,
      itemByErpName,
      shiftMap,
      skipItems,
      existingLogSet,
    };

    // Dispatch theo fileFormat
    const fileFormat = (source as any).fileFormat as string ?? "STANDARD";
    let result;

    switch (fileFormat) {
      case "DANH_ONG":
        result = await parseDanhOng(buffer, maps);
        break;
      case "STANDARD":
      default:
        result = await parseStandard(buffer, maps);
        break;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[parse-excel]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi phân tích file Excel" },
      { status: 400 }
    );
  }
}
