/**
 * Parser STANDARD — cho file XLS/XLSX thông thường
 * Cấu trúc: có cột Ngày, Ca, Máy, Mặt hàng, Sản lượng
 * (dùng cho máy sợi con và các dòng máy có format tương tự)
 */
import * as XLSX from "xlsx";
import { ParseResult, LookupMaps } from "./types";
import { normalize, parseDate, parseShift, parseOutput, isSummaryRow, BUILTIN_SHIFT_MAP } from "./utils";

export async function parseStandard(
  buffer: ArrayBuffer,
  maps: LookupMaps
): Promise<ParseResult> {
  const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const allRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as string[][];

  if (allRows.length < 3) {
    throw new Error("File không đủ dữ liệu (cần ít nhất 3 hàng)");
  }

  // Hàng 0: tiêu đề merged → bỏ qua
  // Hàng 1: header thực sự
  // Hàng 2+: dữ liệu
  const headerRow = allRows[1] ?? [];
  const rawHeaders = headerRow.map((h) => String(h));
  const normHeaders = rawHeaders.map(normalize);

  const dataRows = allRows.slice(2).filter((row) => {
    if (!row.some((c) => c !== "")) return false;
    if (isSummaryRow(String(row[0] ?? ""))) return false;
    return true;
  });

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

  const missingCols: string[] = [];
  if (colIndex.date === -1) missingCols.push("ngày");
  if (colIndex.shift === -1) missingCols.push("ca làm việc");
  if (colIndex.machine === -1) missingCols.push("máy");
  if (colIndex.output === -1) missingCols.push("sản lượng");

  if (missingCols.length > 0) {
    throw new Error(`Không tìm được cột: ${missingCols.join(", ")}. Header tìm thấy: ${rawHeaders.join(", ")}`);
  }

  const unmappedMachinesSet = new Set<string>();
  const unmappedItemsSet = new Set<string>();
  const unmappedShiftsSet = new Set<string>();

  const preRows = dataRows.map((row, i) => {
    const rawDate = String(row[colIndex.date] ?? "").trim();
    const rawShift = String(row[colIndex.shift] ?? "").trim();
    const rawMachine = String(row[colIndex.machine] ?? "").trim();
    const rawItem = colIndex.item >= 0 ? String(row[colIndex.item] ?? "").trim() : "";
    const rawOutputStr = String(row[colIndex.output] ?? "").trim();

    const mappedDate = parseDate(rawDate);
    const mappedShift = parseShift(rawShift, maps.shiftMap);

    const machineResolved = rawMachine
      ? (maps.machineMapByIot[rawMachine] ?? maps.machineByErpName[rawMachine] ?? null)
      : null;
    const itemResolved = rawItem
      ? (maps.itemMapByIot[rawItem] ?? maps.itemByErpName[rawItem] ?? null)
      : null;

    const finalOutput = parseOutput(rawOutputStr);

    if (!machineResolved && rawMachine) unmappedMachinesSet.add(rawMachine);
    if (!itemResolved && rawItem) unmappedItemsSet.add(rawItem);
    if (!mappedShift && rawShift && BUILTIN_SHIFT_MAP[rawShift.toLowerCase()] === undefined) {
      unmappedShiftsSet.add(rawShift);
    }

    return {
      rowIndex: i + 3,
      rawDate,
      rawShift,
      rawMachine,
      rawItem,
      mappedDate,
      mappedShift,
      mappedMachineId: machineResolved?.id ?? null,
      mappedMachineName: machineResolved?.name ?? null,
      mappedItemId: itemResolved?.id ?? null,
      mappedItemName: itemResolved?.name ?? null,
      finalOutput,
    };
  });

  // Gán status + action
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
      action = maps.existingLogSet.has(key) ? "UPDATE" : "INSERT";
    }

    return { ...r, status, action };
  });

  return {
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
  };
}
