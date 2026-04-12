/**
 * Parser DANH_ONG — cho file HTML-as-XLS của máy đánh ống
 *
 * Đặc điểm:
 * - File là HTML table được đặt tên .xls
 * - Ngày + ca KHÔNG nằm trong bảng, mà nằm trong thẻ <div> dạng: "Ca: Apr/01/2026 - 2"
 * - Hàng 1 (index 0): header (Lô | Số thứ tự máy | ... | PRKG(kg) | ...)
 * - Hàng 2+: dữ liệu
 * - Cột A (index 0): tên mặt hàng (Lô)
 * - Cột B (index 1): số thứ tự máy — nếu rỗng thì skip cả dòng
 * - Cột M (index 12): sản lượng kg (PRKG)
 * - Dòng có cột A = "TỔNG" → skip
 */
import { ParseResult, LookupMaps } from "./types";
import { parseDate, parseOutput, isSummaryRow } from "./utils";

/** Parse chuỗi "Ca: Apr/01/2026 - 2" → { date: "2026-04-01", shift: 2 } */
function parseDateShiftFromHeader(raw: string): { date: string | null; shift: number | null } {
  // Format: "Ca: MMM/DD/YYYY - N"
  const match = raw.match(/Ca:\s*([A-Za-z]{3})\/(\d{2})\/(\d{4})\s*-\s*(\d)/i);
  if (!match) return { date: null, shift: null };

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mm = months[match[1].toLowerCase()];
  if (!mm) return { date: null, shift: null };

  const date = `${match[3]}-${mm}-${match[2]}`;
  const shift = parseInt(match[4]);
  return { date, shift: isNaN(shift) ? null : shift };
}

/** Parse HTML table content thành mảng rows */
function parseHtmlTable(htmlContent: string): string[][] {
  // Dùng regex nhẹ để tránh dependency nặng — chỉ cần lấy nội dung text trong <td>/<th>
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(htmlContent)) !== null) {
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    const tdRe = new RegExp(tdRegex.source, "gi");
    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      // Strip HTML tags, decode basic entities
      const text = tdMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** Tìm text "Ca: ..." trong HTML ngoài bảng */
function extractDateShiftText(htmlContent: string): string | null {
  // Tìm trong thẻ <div>, <p>, <span>, <b>, <td> bất kỳ
  const patterns = [
    /<div[^>]*>([\s\S]*?)<\/div>/gi,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    /<span[^>]*>([\s\S]*?)<\/span>/gi,
    /<b[^>]*>([\s\S]*?)<\/b>/gi,
  ];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(htmlContent)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (/Ca:\s*[A-Za-z]{3}\/\d{2}\/\d{4}\s*-\s*\d/i.test(text)) {
        return text;
      }
    }
  }
  return null;
}

export async function parseDanhOng(
  buffer: ArrayBuffer,
  maps: LookupMaps
): Promise<ParseResult> {
  const htmlContent = Buffer.from(buffer).toString("utf-8");

  // 1. Lấy ngày + ca từ header div
  const dateShiftRaw = extractDateShiftText(htmlContent);
  if (!dateShiftRaw) {
    throw new Error(
      'Không tìm thấy thông tin ngày/ca trong file. File cần có dạng "Ca: Apr/01/2026 - 2".'
    );
  }
  const { date: fileDate, shift: fileShift } = parseDateShiftFromHeader(dateShiftRaw);
  if (!fileDate || !fileShift) {
    throw new Error(`Không parse được ngày/ca từ: "${dateShiftRaw}"`);
  }

  // 2. Parse bảng HTML
  const tableRows = parseHtmlTable(htmlContent);
  if (tableRows.length < 2) {
    throw new Error("File không có dữ liệu trong bảng");
  }

  // Hàng 0: header (Lô | Số thứ tự máy | ... | PRKG(kg) | ...)
  const headerRow = tableRows[0];
  const dataRows = tableRows.slice(1);

  // Tìm index cột M (PRKG) từ header
  // Mặc định là index 12, nhưng tìm động để đề phòng file khác thứ tự
  let outputColIndex = 12;
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i].toUpperCase();
    if (h.includes("PRKG") || h.includes("PR KG")) {
      outputColIndex = i;
      break;
    }
  }

  const unmappedMachinesSet = new Set<string>();
  const unmappedItemsSet = new Set<string>();

  const preRows: Array<{
    rowIndex: number;
    rawMachine: string;
    rawItem: string;
    mappedMachineId: number | null;
    mappedMachineName: string | null;
    mappedItemId: number | null;
    mappedItemName: string | null;
    finalOutput: number;
  }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawItem = (row[0] ?? "").trim();
    const rawMachine = (row[1] ?? "").trim();
    const rawOutputStr = (row[outputColIndex] ?? "").trim();

    // Bỏ qua dòng TỔNG
    if (isSummaryRow(rawItem)) continue;

    // Bỏ qua dòng không có số máy
    if (!rawMachine) continue;

    const finalOutput = parseOutput(rawOutputStr);

    // Resolve máy: mapping trước, nếu không có thì thử khớp tên ERP
    // Với máy đánh ống, rawMachine là số (VD: "1", "2"...) → cần mapping
    const machineResolved =
      maps.machineMapByIot[rawMachine] ?? maps.machineByErpName[rawMachine] ?? null;

    // Resolve mặt hàng tương tự
    const itemResolved =
      maps.itemMapByIot[rawItem] ?? maps.itemByErpName[rawItem] ?? null;

    if (!machineResolved && rawMachine) unmappedMachinesSet.add(rawMachine);
    if (!itemResolved && rawItem) unmappedItemsSet.add(rawItem);

    preRows.push({
      rowIndex: i + 2, // +2 vì đã bỏ header
      rawMachine,
      rawItem,
      mappedMachineId: machineResolved?.id ?? null,
      mappedMachineName: machineResolved?.name ?? null,
      mappedItemId: itemResolved?.id ?? null,
      mappedItemName: itemResolved?.name ?? null,
      finalOutput,
    });
  }

  // Gán status + action — ngày và ca lấy từ file header (tất cả dùng chung)
  const rows = preRows.map((r) => {
    let status: "READY" | "NO_MACHINE" | "NO_ITEM" | "NO_SHIFT" | "NO_DATE";
    if (!r.mappedMachineId) status = "NO_MACHINE";
    else if (!r.mappedItemId) status = "NO_ITEM";
    else status = "READY";

    let action: "INSERT" | "UPDATE" | null = null;
    if (status === "READY") {
      const key = `${r.mappedMachineId}_${fileDate}_${fileShift}_${r.mappedItemId}`;
      action = maps.existingLogSet.has(key) ? "UPDATE" : "INSERT";
    }

    return {
      rowIndex: r.rowIndex,
      rawDate: dateShiftRaw,       // hiển thị nguyên chuỗi gốc để user dễ nhận ra
      rawShift: `Ca ${fileShift}`,
      rawMachine: r.rawMachine,
      rawItem: r.rawItem,
      mappedDate: fileDate,
      mappedShift: fileShift,
      mappedMachineId: r.mappedMachineId,
      mappedMachineName: r.mappedMachineName,
      mappedItemId: r.mappedItemId,
      mappedItemName: r.mappedItemName,
      finalOutput: r.finalOutput,
      status,
      action,
    };
  });

  return {
    totalRows: rows.length,
    detectedColumns: {
      date: `Tiêu đề file: "${dateShiftRaw}"`,
      shift: `Ca ${fileShift}`,
      machine: headerRow[1] ?? "Số thứ tự máy",
      item: headerRow[0] ?? "Lô",
      output: headerRow[outputColIndex] ?? "PRKG(kg)",
    },
    rows,
    unmappedMachines: Array.from(unmappedMachinesSet),
    unmappedItems: Array.from(unmappedItemsSet),
    unmappedShifts: [], // DANH_ONG không có cột ca → không có unmapped shift
  };
}
