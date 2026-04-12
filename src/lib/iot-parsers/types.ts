// Kiểu dữ liệu dùng chung cho tất cả IoT parsers

export type ParsedRow = {
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
  status: "READY" | "NO_MACHINE" | "NO_ITEM" | "NO_SHIFT" | "NO_DATE" | "SKIPPED";
  action: "INSERT" | "UPDATE" | null;
};

export type ParseResult = {
  totalRows: number;
  detectedColumns: {
    date: string | null;
    shift: string | null;
    machine: string | null;
    item: string | null;
    output: string | null;
  };
  rows: ParsedRow[];
  unmappedMachines: string[];
  unmappedItems: string[];
  unmappedShifts: string[];
};

export type LookupMaps = {
  machineMapByIot: Record<string, { id: number; name: string }>;
  itemMapByIot: Record<string, { id: number; name: string }>;
  machineByErpName: Record<string, { id: number; name: string }>;
  itemByErpName: Record<string, { id: number; name: string }>;
  shiftMap: Record<string, number>;
  skipItems: Set<string>;      // tên mặt hàng IoT cần bỏ qua (không import)
  existingLogSet: Set<string>;
};
