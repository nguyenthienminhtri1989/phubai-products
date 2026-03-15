import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import * as XLSX from "xlsx";

// Normalize: trim + lowercase + bỏ dấu tiếng Việt
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Built-in: Ca 1 / Ca 2 / Ca 3 đã biết sẵn, không cần user thiết lập
const BUILTIN_SHIFT_MAP: Record<string, number> = {
  "ca 1": 1, "ca1": 1, "shift 1": 1,
  "ca 2": 2, "ca2": 2, "shift 2": 2,
  "ca 3": 3, "ca3": 3, "shift 3": 3,
};

function parseShift(raw: string, customShiftMap: Record<string, number>): number | null {
  const key = raw.trim().toLowerCase();
  if (BUILTIN_SHIFT_MAP[key] !== undefined) return BUILTIN_SHIFT_MAP[key];
  return customShiftMap[raw.trim()] ?? null;
}

function parseDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dmyd = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyd) return `${dmyd[3]}-${dmyd[2].padStart(2, "0")}-${dmyd[1].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

function parseOutput(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  return parseFloat(raw.replace(/,/g, "").trim()) || 0;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (
      (session.user as any).role !== "ADMIN" &&
      (session.user as any).accessLevel !== "MANAGER"
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

    if (!source) return NextResponse.json({ error: "Không tìm thấy nguồn IoT" }, { status: 404 });

    const shiftMap = (source.shiftMap as Record<string, number>) ?? {};

    // Build lookup maps từ IotMachineMap / IotItemMap (bước 1)
    const machineMapByIot: Record<string, { id: number; name: string }> = {};
    for (const m of source.machineMaps) {
      machineMapByIot[m.iotName] = { id: m.machineId, name: m.machine.name };
    }
    const itemMapByIot: Record<string, { id: number; name: string }> = {};
    for (const i of source.itemMaps) {
      itemMapByIot[i.iotName] = { id: i.itemId, name: i.item.name };
    }

    // Build lookup maps từ ERP name (bước 2 - exact match)
    const machineByErpName: Record<string, { id: number; name: string }> = {};
    for (const m of allMachines) {
      machineByErpName[m.name] = m;
    }
    const itemByErpName: Record<string, { id: number; name: string }> = {};
    for (const i of allItems) {
      itemByErpName[i.name] = i;
    }

    /**
     * Tra cứu máy theo 3 bước ưu tiên:
     * 1. IotMachineMap (sourceId + iotName)
     * 2. Machine.name exact match
     * 3. null → unmapped
     */
    const resolveMachine = (iotName: string): { id: number; name: string } | null => {
      return machineMapByIot[iotName] ?? machineByErpName[iotName] ?? null;
    };

    /**
     * Tra cứu mặt hàng theo 3 bước ưu tiên:
     * 1. IotItemMap (sourceId + iotName)
     * 2. Item.name exact match
     * 3. null → unmapped
     */
    const resolveItem = (iotName: string): { id: number; name: string } | null => {
      return itemMapByIot[iotName] ?? itemByErpName[iotName] ?? null;
    };

    // Đọc file Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const allRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as string[][];

    if (allRows.length < 3) {
      return NextResponse.json(
        { error: "File không đủ dữ liệu (cần ít nhất 3 hàng: tiêu đề + header + 1 dòng dữ liệu)" },
        { status: 400 }
      );
    }

    // Hàng 0: tiêu đề merged → BỎ QUA
    // Hàng 1: header thực sự
    // Hàng 2+: dữ liệu
    const headerRow = allRows[1] ?? [];
    const dataRows = allRows.slice(2).filter((row) => row.some((c) => c !== ""));
    const rawHeaders = headerRow.map((h) => String(h));
    const normHeaders = rawHeaders.map(normalize);

    // Detect cột
    const colIndex = {
      date: normHeaders.findIndex((h) => h.includes("ngay") || h.includes("date")),
      shift: normHeaders.findIndex((h) => h.includes("ca") || h.includes("shift")),
      machine: normHeaders.findIndex(
        (h) => h.includes("may") || h.includes("machine") || h.includes("thiet bi")
      ),
      item: normHeaders.findIndex(
        (h) =>
          h.includes("chung loai") ||
          h.includes("mat hang") ||
          h.includes("ten hang") ||
          h.includes("item") ||
          h.includes("san pham") ||
          h.includes("hang hoa")
      ),
      output: normHeaders.findIndex(
        (h) =>
          h.includes("san luong") ||
          h.includes("output") ||
          h.includes("thuc te") ||
          h.includes("kg") ||
          h.includes("quantity")
      ),
    };

    // Kiểm tra cột bắt buộc
    const missingCols: string[] = [];
    if (colIndex.date === -1) missingCols.push("ngày");
    if (colIndex.shift === -1) missingCols.push("ca làm việc");
    if (colIndex.machine === -1) missingCols.push("máy");
    if (colIndex.output === -1) missingCols.push("sản lượng");

    if (missingCols.length > 0) {
      return NextResponse.json(
        {
          error: `Không tìm được cột: ${missingCols.join(", ")}`,
          detectedHeaders: rawHeaders,
          hint: "Kiểm tra lại tên cột trong file Excel",
        },
        { status: 400 }
      );
    }

    // Pass 1: Parse toàn bộ dòng, thu thập unmapped, ghi lại min/max date
    const unmappedMachinesSet = new Set<string>();
    const unmappedItemsSet = new Set<string>();
    const unmappedShiftsSet = new Set<string>();

    type PreRow = {
      rowIndex: number;
      rawDate: string;
      rawShift: string;
      rawMachine: string;
      rawItem: string;
      mappedDate: string | null;
      mappedShift: number | null;
      mappedMachineId: number | null;
      mappedMachineName: string | null;
      mappedItemId: number | null;
      mappedItemName: string | null;
      finalOutput: number;
    };

    const preRows: PreRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rawDate = String(row[colIndex.date] ?? "").trim();
      const rawShift = String(row[colIndex.shift] ?? "").trim();
      const rawMachine = String(row[colIndex.machine] ?? "").trim();
      const rawItem = colIndex.item >= 0 ? String(row[colIndex.item] ?? "").trim() : "";
      const rawOutputStr = String(row[colIndex.output] ?? "").trim();

      const mappedDate = parseDate(rawDate);
      const mappedShift = parseShift(rawShift, shiftMap);

      const machineResolved = rawMachine ? resolveMachine(rawMachine) : null;
      const mappedMachineId = machineResolved?.id ?? null;
      const mappedMachineName = machineResolved?.name ?? null;

      const itemResolved = rawItem ? resolveItem(rawItem) : null;
      const mappedItemId = itemResolved?.id ?? null;
      const mappedItemName = itemResolved?.name ?? null;

      const finalOutput = parseOutput(rawOutputStr);

      // Chỉ báo unmapped khi cả 3 bước đều thất bại
      if (!mappedMachineId && rawMachine) unmappedMachinesSet.add(rawMachine);
      if (!mappedItemId && rawItem) unmappedItemsSet.add(rawItem);
      if (!mappedShift && rawShift) {
        const keyLower = rawShift.toLowerCase();
        if (BUILTIN_SHIFT_MAP[keyLower] === undefined) {
          unmappedShiftsSet.add(rawShift);
        }
      }

      preRows.push({
        rowIndex: i + 3,
        rawDate,
        rawShift,
        rawMachine,
        rawItem,
        mappedDate,
        mappedShift,
        mappedMachineId,
        mappedMachineName,
        mappedItemId,
        mappedItemName,
        finalOutput,
      });
    }

    // Pass 2: Batch load ProductionLog để check INSERT/UPDATE (performance O(n) thay vì O(n²))
    const readyPreRows = preRows.filter(
      (r) => r.mappedDate && r.mappedShift && r.mappedMachineId && r.mappedItemId
    );

    let existingSet = new Set<string>();
    if (readyPreRows.length > 0) {
      const sortedDates = readyPreRows.map((r) => r.mappedDate!).sort();
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];

      const existingLogs = await prisma.productionLog.findMany({
        where: {
          recordDate: {
            gte: new Date(minDate),
            lte: new Date(maxDate),
          },
        },
        select: { machineId: true, recordDate: true, shift: true, itemId: true },
      });

      existingSet = new Set(
        existingLogs.map(
          (l) =>
            `${l.machineId}_${l.recordDate.toISOString().split("T")[0]}_${l.shift}_${l.itemId}`
        )
      );
    }

    // Pass 3: Gán status + action cho từng dòng
    const rows = preRows.map((r) => {
      let status: "READY" | "NO_MACHINE" | "NO_ITEM" | "NO_SHIFT" | "NO_DATE";
      if (!r.mappedDate) status = "NO_DATE";
      else if (!r.mappedShift) status = "NO_SHIFT";
      else if (!r.mappedMachineId) status = "NO_MACHINE";
      else if (!r.mappedItemId && colIndex.item >= 0) status = "NO_ITEM";
      else status = "READY";

      let action: "INSERT" | "UPDATE" | null = null;
      if (status === "READY") {
        const key = `${r.mappedMachineId}_${r.mappedDate}_${r.mappedShift}_${r.mappedItemId}`;
        action = existingSet.has(key) ? "UPDATE" : "INSERT";
      }

      return { ...r, status, action };
    });

    return NextResponse.json({
      totalRows: rows.length,
      detectedColumns: {
        date: rawHeaders[colIndex.date] ?? null,
        shift: rawHeaders[colIndex.shift] ?? null,
        machine: rawHeaders[colIndex.machine] ?? null,
        item: colIndex.item >= 0 ? rawHeaders[colIndex.item] : null,
        output: rawHeaders[colIndex.output] ?? null,
      },
      rows,
      unmappedMachines: Array.from(unmappedMachinesSet),
      unmappedItems: Array.from(unmappedItemsSet),
      unmappedShifts: Array.from(unmappedShiftsSet),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi phân tích file Excel" }, { status: 500 });
  }
}
