"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Table,
  Button,
  Select,
  DatePicker,
  InputNumber,
  Input,
  Space,
  Tag,
  Divider,
  message,
  Statistic,
  Spin,
  Alert,
  Tooltip,
  Switch,
  Popconfirm,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  KeyOutlined,
  EditOutlined,
  DeleteOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { getItemColor } from "@/utils/itemColors";

// ============================================================
// Helpers
// ============================================================
const genKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// ============================================================
// Types
// ============================================================
interface RowData {
  machineId: number;
  machineName: string;
  formulaType: number;
  spindleCount: number;
  itemId: number;
  itemName: string;
  originalItemId: number;
  currentLotNumber?: string | null;
  startIndex: number;
  endIndex: number | null;
  inputNE: number;
  isStopped: boolean;
  efficiency: number | null;
  note: string;
  isDirty: boolean;
  existingLogId?: number;
  startIndexEditing?: boolean;
  rowKey: string;
  isSubRow?: boolean;
}

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }
interface ItemOption { id: number; name: string; }

interface ProductionLogEntry {
  id: number;
  itemId: number;
  startIndex: number;
  endIndex: number | null;
  inputNE: number;
  efficiency: number | null;
  note: string;
  item?: { id: number; name: string } | null;
}

interface MachineAssignment {
  id: number;
  machineId: number;
  itemId: number;
  fromSpindle?: number | null;
  toSpindle?: number | null;
  item: { id: number; name: string };
}

interface MachineStatus {
  id: number;
  name: string;
  formulaType: number;
  spindleCount: number;
  currentNE?: number;
  currentItem?: { id: number; name: string } | null;
  currentLot?: { id: number; lotNumber: string } | null;
  todayLog: ProductionLogEntry | null;
  todayLogs: ProductionLogEntry[];
  allowMultiItemPerShift?: boolean;
}

interface SessionUser {
  role?: string;
  userRole?: string;
  accessLevel?: string;
  processIds?: unknown[];
}

// ============================================================
// Tính sản lượng theo formulaType
// ============================================================
function calcOutput(row: RowData): number {
  if (row.isStopped) return 0;
  const end = row.endIndex;
  if (end === null || end === undefined || isNaN(Number(end))) return 0;

  const start = row.startIndex || 0;
  const delta = Number(end) - start;
  const type = row.formulaType;
  let result = 0;

  if (type === 1) result = Number(end);
  else if (type === 2) result = delta;
  else if (type === 3) {
    const ne = row.inputNE || 1;
    const spindles = row.spindleCount || 1;
    const denom = ne * 1000 * 1.693;
    if (denom !== 0) result = (delta * spindles) / denom;
  } else if (type === 4) {
    const ne = row.inputNE || 1;
    if (ne !== 0) result = delta / ne;
  }

  const final = Math.round(result);
  return isNaN(final) ? 0 : final;
}

// ============================================================
// Main Page
// ============================================================
export default function DailyInputGridPage() {
  const { data: session } = useSession();

  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [factoryId, setFactoryId] = useState<number | undefined>();
  const [processId, setProcessId] = useState<number | undefined>();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [shift, setShift] = useState<number>(1);

  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
  const [editingLotKey, setEditingLotKey] = useState<string | null>(null);
  const [machineAssignments, setMachineAssignments] = useState<Record<number, MachineAssignment[]>>({});

  // Phân quyền
  const su = session?.user as SessionUser | undefined;
  const isAdmin = su?.role === "ADMIN";
  const userRole = su?.userRole;
  const isReadOnly = !isAdmin && su?.accessLevel === "READ_ONLY";
  const ALLOWED_DELETE_ROLES = ["ADMIN", "DIRECTOR", "FACTORY_MANAGER", "STATISTICIAN"];
  const canDelete = isAdmin || (userRole ? ALLOWED_DELETE_ROLES.includes(userRole) : false);

  // Tự động chọn ca theo giờ hiện tại
  useEffect(() => {
    const hour = dayjs().hour();
    if (hour >= 13 && hour < 21) setShift(1);
    else if (hour >= 21) setShift(2);
    else if (hour >= 0 && hour < 5) { setShift(2); setDate(dayjs().subtract(1, "day")); }
    else setShift(3);
  }, []);

  // Tải metadata
  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then(r => r.json()),
      fetch("/api/processes").then(r => r.json()),
      fetch("/api/items").then(r => r.json()),
    ]).then(([facs, procs, its]: [Factory[], Process[], ItemOption[]]) => {
      setFactories(Array.isArray(facs) ? facs : []);
      setProcesses(Array.isArray(procs) ? procs : []);
      setItems(Array.isArray(its) ? its : []);
    }).catch(() => message.error("Lỗi tải danh mục"));
  }, []);

  // Tự động chọn công đoạn nếu user chỉ quản lý 1 công đoạn
  useEffect(() => {
    if (isAdmin || processes.length === 0) return;
    const rawIds = su?.processIds ?? [];
    const userProcessIds: number[] = Array.isArray(rawIds) ? rawIds.map(Number) : [];
    if (userProcessIds.length === 1) {
      const target = processes.find(p => p.id === userProcessIds[0]);
      if (target) {
        setFactoryId(target.factoryId);
        setProcessId(target.id);
      }
    }
  }, [processes, su, isAdmin]);

  // ============================================================
  // Tải danh sách máy + dữ liệu ca đã nhập
  // ============================================================
  const handleLoad = useCallback(async () => {
    if (!processId) {
      message.warning("Vui lòng chọn công đoạn");
      return;
    }
    setFetching(true);
    setEditingItemKey(null);
    setEditingLotKey(null);
    try {
      const dateStr = date.format("YYYY-MM-DD");

      const statusRes = await fetch(
        `/api/production/daily-status?processId=${processId}&date=${dateStr}&shift=${shift}`
      );
      if (!statusRes.ok) throw new Error("Lỗi tải danh sách máy");
      const machines: MachineStatus[] = await statusRes.json();

      // Fetch assignments cho máy multi-item
      const assignmentMap: Record<number, MachineAssignment[]> = {};
      for (const m of machines) {
        if (m.allowMultiItemPerShift) {
          try {
            const aRes = await fetch(`/api/machines/${m.id}/assignments`);
            if (aRes.ok) assignmentMap[m.id] = await aRes.json();
          } catch { }
        }
      }
      setMachineAssignments(assignmentMap);

      // Với mỗi máy chưa có log → tải last-log để lấy startIndex
      const machinesNeedingLastLog = machines.filter(m => !m.todayLog);
      const lastLogResults = await Promise.all(
        machinesNeedingLastLog.map(m =>
          fetch(`/api/production/last-log?machineId=${m.id}&date=${dateStr}&shift=${shift}`)
            .then(r => r.ok ? (r.json() as Promise<{ endIndex?: number | null }>) : null)
            .catch(() => null)
        )
      );
      const lastLogMap = new Map<number, number>();
      machinesNeedingLastLog.forEach((m, idx) => {
        const log = lastLogResults[idx];
        if (log?.endIndex != null) lastLogMap.set(m.id, log.endIndex);
      });

      // Build rows — hỗ trợ nhiều mặt hàng/máy/ca (sub-rows)
      const newRows: RowData[] = [];
      machines.forEach(m => {
        const logs: ProductionLogEntry[] = m.todayLogs ?? (m.todayLog ? [m.todayLog] : []);
        const assignments = assignmentMap[m.id];

        // Máy multi-item: tạo 1 row per assignment
        if (m.allowMultiItemPerShift && assignments && assignments.length > 0) {
          assignments.forEach((a, idx) => {
            const existingLog = logs.find(l => l.itemId === a.itemId);
            const itemLabel = `${a.item.name}${a.fromSpindle ? ` (cọc ${a.fromSpindle}-${a.toSpindle})` : ""}`;
            newRows.push({
              machineId: m.id,
              machineName: m.name,
              formulaType: 1, // nhập kg trực tiếp cho máy ống
              spindleCount: m.spindleCount || 1,
              itemId: a.item.id,
              itemName: itemLabel,
              originalItemId: a.item.id,
              currentLotNumber: m.currentLot?.lotNumber ?? null,
              startIndex: 0,
              endIndex: existingLog?.endIndex ?? null,
              inputNE: 0,
              isStopped: existingLog?.note === "Máy dừng",
              efficiency: existingLog?.efficiency ?? null,
              note: (existingLog?.note === "Máy dừng" || existingLog?.note === "Sửa chỉ số trước") ? "" : (existingLog?.note ?? ""),
              isDirty: false,
              existingLogId: existingLog?.id,
              rowKey: genKey(),
              isSubRow: idx > 0,
            });
          });
          return; // skip logic thường
        }

        // Logic thường cho máy 1 mặt hàng/ca
        if (logs.length === 0) {
          newRows.push({
            machineId: m.id,
            machineName: m.name,
            formulaType: m.formulaType,
            spindleCount: m.spindleCount || 1,
            itemId: m.currentItem?.id ?? 0,
            itemName: m.currentItem?.name ?? "Chưa gán",
            originalItemId: m.currentItem?.id ?? 0,
            currentLotNumber: m.currentLot?.lotNumber ?? null,
            startIndex: lastLogMap.get(m.id) ?? 0,
            endIndex: null,
            inputNE: m.currentNE ?? 30,
            isStopped: false,
            efficiency: null,
            note: "",
            isDirty: false,
            rowKey: genKey(),
            isSubRow: false,
          });
        } else {
          logs.forEach((log, idx) => {
            newRows.push({
              machineId: m.id,
              machineName: m.name,
              formulaType: m.formulaType,
              spindleCount: m.spindleCount || 1,
              itemId: log.itemId ?? m.currentItem?.id ?? 0,
              itemName: log.item?.name ?? m.currentItem?.name ?? "Chưa gán",
              originalItemId: log.itemId ?? m.currentItem?.id ?? 0,
              currentLotNumber: m.currentLot?.lotNumber ?? null,
              startIndex: log.startIndex ?? 0,
              endIndex: log.endIndex ?? null,
              inputNE: log.inputNE ?? m.currentNE ?? 30,
              isStopped: log.note === "Máy dừng",
              efficiency: log.efficiency ?? null,
              note: (log.note === "Máy dừng" || log.note === "Sửa chỉ số trước") ? "" : (log.note ?? ""),
              isDirty: false,
              existingLogId: log.id,
              rowKey: genKey(),
              isSubRow: idx > 0,
            });
          });
        }
      });

      setRows(newRows);
      const primaryCount = newRows.filter(r => !r.isSubRow).length;
      const entered = newRows.filter(r => r.endIndex !== null || r.isStopped).length;
      message.success(`Đã tải ${primaryCount} máy. Đã nhập: ${entered}/${newRows.length} bản ghi`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setFetching(false);
    }
  }, [processId, date, shift]);

  // ============================================================
  // Thêm sub-row (đổi mặt hàng giữa ca)
  // ============================================================
  const handleAddSubRow = useCallback((rowIdx: number) => {
    const parentRow = rows[rowIdx];

    let insertAfterIdx = rowIdx;
    for (let i = rowIdx + 1; i < rows.length; i++) {
      if (rows[i].machineId === parentRow.machineId) {
        insertAfterIdx = i;
      } else {
        break;
      }
    }

    // Smart startIndex: máy cộng dồn (type 2/3/4) lấy endIndex dòng trước làm startIndex
    const prevRow = rows[insertAfterIdx];
    const smartStartIndex =
      prevRow.formulaType !== 1 && prevRow.endIndex !== null
        ? prevRow.endIndex
        : 0;

    const newSubRow: RowData = {
      machineId: parentRow.machineId,
      machineName: parentRow.machineName,
      formulaType: parentRow.formulaType,
      spindleCount: parentRow.spindleCount,
      itemId: 0,
      itemName: "Chưa gán",
      originalItemId: 0,
      currentLotNumber: parentRow.currentLotNumber ?? null,
      startIndex: smartStartIndex,
      endIndex: null,
      inputNE: parentRow.inputNE,
      isStopped: false,
      efficiency: null,
      note: "",
      isDirty: false,
      rowKey: genKey(),
      isSubRow: true,
    };

    setRows(prev => {
      const next = [...prev];
      next.splice(insertAfterIdx + 1, 0, newSubRow);
      return next;
    });
  }, [rows]);

  // ============================================================
  // Xóa sub-row
  // ============================================================
  const handleRemoveSubRow = useCallback(async (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r.existingLogId) {
      setRows(prev => prev.filter((_, i) => i !== rowIdx));
      return;
    }
    try {
      const res = await fetch(`/api/production/daily-input?id=${r.existingLogId}`, { method: "DELETE" });
      if (!res.ok) { const d: { error?: string } = await res.json(); throw new Error(d.error || "Lỗi xóa"); }
      message.success(`Đã xóa bản ghi ${r.machineName} — ${r.itemName}`);
      setRows(prev => prev.filter((_, i) => i !== rowIdx));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi xóa bản ghi");
    }
  }, [rows]);

  // ============================================================
  // Paste từ Excel (Ctrl+V)
  // ============================================================
  const handlePaste = useCallback((e: React.ClipboardEvent, startRowIndex: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return;

    e.preventDefault();

    const values = text
      .split("\n")
      .map(line => line.split("\t")[0].trim())
      .filter(line => line !== "")
      .map(line => {
        const cleaned = line.replace(/,/g, "").replace(/\s/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      });

    if (values.length === 0) return;

    setRows(prev => {
      const next = [...prev];
      let pasteIdx = 0;
      for (let i = startRowIndex; i < next.length && pasteIdx < values.length; i++) {
        if (next[i].isSubRow) continue;
        const val = values[pasteIdx++];
        if (val !== null) {
          next[i] = { ...next[i], endIndex: val, isDirty: true };
        }
      }
      return next;
    });

    const filled = values.filter(v => v !== null).length;
    const skipped = values.filter(v => v === null).length;
    message.success(
      `Đã dán ${filled} giá trị` + (skipped > 0 ? ` (bỏ qua ${skipped} ô không hợp lệ)` : "")
    );
  }, []);

  // ============================================================
  // Điền "Máy dừng" cho bản ghi chưa nhập
  // ============================================================
  const handleFillStopped = useCallback(() => {
    const count = rows.filter(r => r.endIndex === null && !r.isStopped && r.itemId !== 0).length;
    if (count === 0) { message.info("Tất cả đã được nhập liệu rồi"); return; }
    setRows(prev => prev.map(r =>
      r.endIndex === null && !r.isStopped && r.itemId !== 0
        ? { ...r, isStopped: true, isDirty: true }
        : r
    ));
    message.info(`Đã đánh dấu "Máy dừng" cho ${count} bản ghi chưa nhập`);
  }, [rows]);

  // ============================================================
  // Lưu tất cả
  // ============================================================
  const handleSave = useCallback(async () => {
    const dirty = rows.filter(r => r.isDirty && r.itemId !== 0 && (r.isStopped || r.endIndex !== null));
    if (dirty.length === 0) {
      message.warning("Không có thay đổi nào để lưu");
      return;
    }

    const negativeRows = dirty.filter(r => !r.isStopped && calcOutput(r) < 0);
    if (negativeRows.length > 0) {
      message.error(`${negativeRows.length} bản ghi có sản lượng âm. Vui lòng kiểm tra lại.`);
      return;
    }

    setLoading(true);
    try {
      const dateStr = date.format("YYYY-MM-DD");

      // Cập nhật điều phối nếu mặt hàng thay đổi (chỉ primary rows)
      const itemChangedRows = dirty.filter(r => !r.isSubRow && r.itemId !== r.originalItemId && r.itemId !== 0);
      for (const r of itemChangedRows) {
        const res = await fetch("/api/machines/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineIds: [r.machineId], itemId: r.itemId }),
        });
        if (!res.ok) {
          const data: { error?: string } = await res.json();
          throw new Error(`Không thể cập nhật điều phối máy ${r.machineName}: ${data.error ?? ""}`);
        }
      }
      if (itemChangedRows.length > 0) {
        message.info(`Đã cập nhật điều phối cho ${itemChangedRows.length} máy đổi mặt hàng`);
      }

      const results = await Promise.allSettled(
        dirty.map(r => {
          const finalOutput = r.isStopped ? 0 : calcOutput(r);
          const noteVal = r.isStopped ? "Máy dừng" : (r.note || "");
          return fetch("/api/production/daily-input", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recordDate: dateStr,
              shift,
              machineId: r.machineId,
              itemId: r.itemId,
              startIndex: r.startIndex,
              endIndex: r.isStopped ? null : r.endIndex,
              inputNE: r.inputNE,
              finalOutput,
              efficiency: r.efficiency,
              note: noteVal,
            }),
          }).then(res => {
            if (!res.ok) throw new Error(`Lỗi lưu ${r.machineName}${r.isSubRow ? ` (${r.itemName})` : ""}`);
            return res.json() as Promise<{ id?: number }>;
          });
        })
      );

      const succeeded = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected");

      if (failed.length > 0) {
        failed.forEach(f => {
          if (f.status === "rejected") message.error((f.reason as Error).message);
        });
      }
      if (succeeded > 0) message.success(`Đã lưu ${succeeded}/${dirty.length} bản ghi thành công`);

      const rowKeyToLogId = new Map<string, number>();
      dirty.forEach((r, idx) => {
        if (results[idx].status === "fulfilled") {
          const id = (results[idx] as PromiseFulfilledResult<{ id?: number }>).value?.id;
          if (id) rowKeyToLogId.set(r.rowKey, id);
        }
      });

      setRows(prev => prev.map(r => {
        if (!r.isDirty) return r;
        const newId = rowKeyToLogId.get(r.rowKey);
        return { ...r, isDirty: false, originalItemId: r.itemId, existingLogId: newId ?? r.existingLogId };
      }));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi lưu dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [rows, date, shift]);

  // ============================================================
  // Xóa log của 1 primary row
  // ============================================================
  const handleDeleteRow = useCallback(async (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r.existingLogId) return;
    try {
      const res = await fetch(`/api/production/daily-input?id=${r.existingLogId}`, { method: "DELETE" });
      if (!res.ok) { const d: { error?: string } = await res.json(); throw new Error(d.error || "Lỗi xóa"); }
      message.success(`Đã xóa bản ghi ${r.machineName}`);
      setRows(prev => prev.map((row, i) => i === rowIdx
        ? { ...row, endIndex: null, isStopped: false, note: "", efficiency: null, isDirty: false, existingLogId: undefined }
        : row
      ));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi xóa bản ghi");
    }
  }, [rows]);

  // ============================================================
  // Thống kê
  // ============================================================
  const dirtyCount = rows.filter(r => r.isDirty && r.itemId !== 0).length;
  const enteredCount = rows.filter(r => r.endIndex !== null || r.isStopped).length;
  const primaryCount = rows.filter(r => !r.isSubRow).length;
  const totalKg = useMemo(() =>
    rows.reduce((s, r) => s + calcOutput(r), 0),
    [rows]
  );

  const machineNumbers = useMemo(() => {
    const map = new Map<string, number>();
    let count = 0;
    for (const row of rows) {
      if (!row.isSubRow) map.set(row.rowKey, ++count);
    }
    return map;
  }, [rows]);

  // ============================================================
  // Columns
  // ============================================================
  const columns = [
    {
      title: "#",
      width: 42,
      render: (_: unknown, r: RowData) => r.isSubRow
        ? <span style={{ color: "#bbb", fontSize: 13 }}>↳</span>
        : <span style={{ fontSize: 12, color: "#999" }}>{machineNumbers.get(r.rowKey)}</span>,
    },
    {
      title: "Máy",
      dataIndex: "machineName",
      width: 95,
      render: (v: string, r: RowData) => r.isSubRow
        ? <span style={{ color: "#aaa", fontSize: 12 }}>↳ {v}</span>
        : <b style={{ fontSize: 13 }}>{v}</b>,
    },
    {
      title: "Mặt hàng",
      width: 180,
      render: (_: unknown, r: RowData, i: number) => {
        const isEditing = editingItemKey === r.rowKey;
        const changed = r.itemId !== r.originalItemId && r.itemId !== 0;

        if (isEditing || r.itemId === 0) {
          return (
            <Select
              autoFocus={isEditing}
              showSearch
              filterOption={(input, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: 160 }}
              placeholder="Chọn mặt hàng..."
              value={r.itemId || undefined}
              onChange={val => {
                const item = items.find(it => it.id === val);
                if (!item) return;
                setRows(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], itemId: item.id, itemName: item.name, isDirty: true };
                  return next;
                });
                setEditingItemKey(null);
              }}
              options={items.map(it => ({ label: it.name, value: it.id }))}
              onBlur={() => { if (r.itemId !== 0) setEditingItemKey(null); }}
            />
          );
        }

        return (
          <Space size={4}>
            <Tag color={changed ? "orange" : getItemColor(r.itemName)}
              style={{ fontSize: 12, fontWeight: 600, cursor: "default" }}>
              {r.itemName}
            </Tag>
            {changed && <Tag color="orange" style={{ fontSize: 10 }}>Sẽ cập nhật</Tag>}
            {!isReadOnly && (
              <Tooltip title="Thay đổi mặt hàng">
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12, color: "#aaa" }} />}
                  onClick={() => setEditingItemKey(r.rowKey)}
                  style={{ padding: "0 2px", height: 20 }}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "Lô",
      key: "lot",
      width: 130,
      render: (_: unknown, r: RowData, i: number) => {
        const isEditingLot = editingLotKey === r.rowKey;

        if (isEditingLot) {
          return (
            <Input
              autoFocus
              size="small"
              style={{ width: 110 }}
              defaultValue={r.currentLotNumber ?? ""}
              placeholder="Số lô..."
              onPressEnter={e => {
                const val = (e.target as HTMLInputElement).value.trim() || null;
                setRows(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], currentLotNumber: val, isDirty: true };
                  return next;
                });
                setEditingLotKey(null);
              }}
              onBlur={e => {
                const val = e.target.value.trim() || null;
                setRows(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], currentLotNumber: val, isDirty: true };
                  return next;
                });
                setEditingLotKey(null);
              }}
            />
          );
        }

        return (
          <Space size={4}>
            {r.currentLotNumber
              ? <Tag color="orange" style={{ fontSize: 11 }}>{r.currentLotNumber}</Tag>
              : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}
            {!isReadOnly && (
              <Tooltip title="Thay đổi số lô">
                <Button
                  type="text" size="small"
                  icon={<EditOutlined style={{ fontSize: 12, color: "#aaa" }} />}
                  onClick={() => setEditingLotKey(r.rowKey)}
                  style={{ padding: "0 2px", height: 20 }}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: () => <span>Chỉ số <span style={{ color: "#999", fontWeight: 400 }}>TRƯỚC</span></span>,
      width: 105,
      render: (_: unknown, r: RowData, i: number) => {
        if (r.formulaType === 1) return <span style={{ color: "#ccc", fontSize: 12 }}>—</span>;
        return r.startIndexEditing ? (
          <InputNumber
            autoFocus
            size="small"
            style={{ width: 85 }}
            value={r.startIndex}
            controls={false}
            onChange={val => setRows(prev => {
              const next = [...prev];
              next[i] = { ...next[i], startIndex: val ?? 0, isDirty: true };
              return next;
            })}
            onBlur={() => setRows(prev => {
              const next = [...prev];
              next[i] = { ...next[i], startIndexEditing: false };
              return next;
            })}
          />
        ) : (
          <Space size={2}>
            <span style={{ fontSize: 13, color: "#595959" }}>
              {r.startIndex != null ? r.startIndex.toLocaleString("vi-VN") : "0"}
            </span>
            {!isReadOnly && (
              <Tooltip title="Sửa chỉ số trước">
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11, color: "#ccc" }} />}
                  onClick={() => setRows(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], startIndexEditing: true };
                    return next;
                  })}
                  style={{ padding: "0 2px", height: 18 }}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: () => (
        <span>
          Chỉ số <span style={{ color: "#1677ff", fontWeight: 600 }}>SAU</span>
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>(type 1 = kg)</span>
        </span>
      ),
      width: 140,
      render: (_: unknown, r: RowData, i: number) => (
        <InputNumber
          size="small"
          style={{
            width: 120,
            fontWeight: r.endIndex !== null ? 700 : 400,
            borderColor: r.endIndex !== null && !r.isStopped ? "#52c41a" :
              (r.isStopped ? "#faad14" : undefined),
          }}
          value={r.isStopped ? undefined : (r.endIndex ?? undefined)}
          placeholder={r.itemId === 0 ? "Chọn mặt hàng trước" : r.isStopped ? "Máy dừng" : (r.formulaType === 1 ? "kg..." : "Chỉ số...")}
          disabled={r.itemId === 0 || r.isStopped || isReadOnly}
          controls={false}
          onChange={val => {
            setRows(prev => {
              const next = [...prev];
              next[i] = { ...next[i], endIndex: val ?? null, isDirty: true };
              return next;
            });
          }}
          onPaste={e => handlePaste(e, i)}
        />
      ),
    },
    {
      title: "NE",
      width: 72,
      render: (_: unknown, r: RowData, i: number) => {
        if (r.formulaType !== 3 && r.formulaType !== 4) {
          return <span style={{ color: "#ddd", fontSize: 12 }}>—</span>;
        }
        return (
          <InputNumber
            size="small"
            style={{ width: 60 }}
            value={r.inputNE}
            controls={false}
            disabled={r.itemId === 0 || r.isStopped || isReadOnly}
            onChange={val => setRows(prev => {
              const next = [...prev];
              next[i] = { ...next[i], inputNE: val ?? 30, isDirty: true };
              return next;
            })}
          />
        );
      },
    },
    {
      title: "SL (kg)",
      width: 90,
      render: (_: unknown, r: RowData) => {
        if (r.isStopped) return <Tag color="warning" style={{ fontSize: 12 }}>Dừng</Tag>;
        const output = calcOutput(r);
        if (r.endIndex === null) return <span style={{ color: "#ccc" }}>—</span>;
        return (
          <b style={{ color: output < 0 ? "red" : "#389e0d", fontSize: 14 }}>
            {output.toLocaleString("vi-VN")}
          </b>
        );
      },
    },
    {
      title: "Dừng",
      width: 62,
      render: (_: unknown, r: RowData, i: number) => (
        <Switch
          size="small"
          checked={r.isStopped}
          disabled={r.itemId === 0 || isReadOnly}
          onChange={val => setRows(prev => {
            const next = [...prev];
            next[i] = { ...next[i], isStopped: val, isDirty: true };
            return next;
          })}
        />
      ),
    },
    {
      title: "Hiệu suất",
      width: 90,
      render: (_: unknown, r: RowData, i: number) => (
        <InputNumber
          size="small"
          style={{ width: 72 }}
          value={r.efficiency ?? undefined}
          min={0}
          max={200}
          controls={false}
          placeholder="%"
          disabled={r.itemId === 0 || r.isStopped || isReadOnly}
          formatter={(v: number | string | undefined) =>
            v !== undefined && v !== null ? `${v}%` : ""
          }
          parser={(v: string | undefined) => {
            if (!v) return 0;
            const n = parseFloat(v.replace("%", "").replace(",", "."));
            return isNaN(n) ? 0 : n;
          }}
          onChange={val => setRows(prev => {
            const next = [...prev];
            next[i] = { ...next[i], efficiency: val != null ? Number(val) : null, isDirty: true };
            return next;
          })}
        />
      ),
    },
    {
      title: "Ghi chú",
      render: (_: unknown, r: RowData, i: number) => (
        <Input
          size="small"
          value={r.isStopped ? "" : r.note}
          placeholder={r.itemId === 0 ? "Chọn mặt hàng trước" : r.isStopped ? "Máy dừng" : "Ghi chú..."}
          disabled={r.itemId === 0 || r.isStopped || isReadOnly}
          style={{ width: 150 }}
          onChange={e => setRows(prev => {
            const next = [...prev];
            next[i] = { ...next[i], note: e.target.value, isDirty: true };
            return next;
          })}
        />
      ),
    },
    {
      title: "Trạng thái",
      width: 100,
      render: (_: unknown, r: RowData) => {
        if (r.itemId === 0) return <Tag color="warning">Chọn MH</Tag>;
        if (r.isStopped) return <Tag color="orange">Máy dừng</Tag>;
        if (r.isDirty) return <Tag color="processing">Chưa lưu</Tag>;
        if (r.endIndex !== null) return <Tag color="success">Đã nhập</Tag>;
        return <Tag color="default">Chưa nhập</Tag>;
      },
    },
    {
      title: "",
      width: 60,
      render: (_: unknown, r: RowData, i: number) => {
        if (isReadOnly) return null;

        if (!r.isSubRow) {
          return (
            <Space size={2}>
              {!machineAssignments[r.machineId] && (
                <Tooltip title="Thêm dòng đổi mặt hàng">
                  <Button
                    type="text" size="small"
                    icon={<PlusOutlined style={{ fontSize: 11, color: "#1677ff" }} />}
                    onClick={() => handleAddSubRow(i)}
                    style={{ padding: "0 4px" }}
                  />
                </Tooltip>
              )}
              {canDelete && r.existingLogId && (
                <Popconfirm
                  title="Xóa bản ghi ca này?"
                  onConfirm={() => handleDeleteRow(i)}
                  okText="Xóa" okButtonProps={{ danger: true }}
                  cancelText="Hủy"
                >
                  <Button type="text" size="small" danger
                    icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                    style={{ padding: "0 4px" }}
                  />
                </Popconfirm>
              )}
            </Space>
          );
        } else {
          if (!r.existingLogId) {
            return (
              <Tooltip title="Xóa dòng này">
                <Button
                  type="text" size="small" danger
                  icon={<CloseOutlined style={{ fontSize: 11 }} />}
                  onClick={() => handleRemoveSubRow(i)}
                  style={{ padding: "0 4px" }}
                />
              </Tooltip>
            );
          } else if (canDelete) {
            return (
              <Popconfirm
                title="Xóa bản ghi này?"
                onConfirm={() => handleRemoveSubRow(i)}
                okText="Xóa" okButtonProps={{ danger: true }}
                cancelText="Hủy"
              >
                <Button type="text" size="small" danger
                  icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                  style={{ padding: "0 4px" }}
                />
              </Popconfirm>
            );
          }
          return null;
        }
      },
    },
  ];

  // ============================================================
  // Danh sách factories / processes lọc theo quyền
  // ============================================================
  const rawIds = su?.processIds ?? [];
  const userProcessIds: number[] = Array.isArray(rawIds) ? rawIds.map(Number) : [];
  const isLocked = !isAdmin && userProcessIds.length === 1;
  const visibleProcesses = isAdmin ? processes : processes.filter(p => userProcessIds.includes(p.id));
  const allowedFactoryIds = isAdmin ? null : [...new Set(visibleProcesses.map(p => p.factoryId))];
  const visibleFactories = isAdmin ? factories : factories.filter(f => allowedFactoryIds!.includes(f.id));

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: "0 8px" }}>
      {isReadOnly && (
        <div style={{
          background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 8,
          padding: "10px 16px", marginBottom: 10, color: "#d46b08", fontWeight: 500
        }}>
          Tài khoản chỉ có quyền <b>xem</b>. Liên hệ quản trị viên để được cấp quyền nhập liệu.
        </div>
      )}

      {/* Filter bar */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          placeholder="Nhà máy"
          style={{ width: 150 }}
          value={factoryId}
          disabled={isLocked}
          onChange={v => { setFactoryId(v); setProcessId(undefined); setRows([]); }}
          options={visibleFactories.map(f => ({ label: f.name, value: f.id }))}
        />
        <Select
          placeholder="Công đoạn"
          style={{ width: 180 }}
          value={processId}
          disabled={!factoryId || isLocked}
          onChange={v => { setProcessId(v); setRows([]); }}
          options={visibleProcesses.filter(p => p.factoryId === factoryId).map(p => ({ label: p.name, value: p.id }))}
        />

        <Space.Compact>
          <Button icon={<LeftOutlined />} onClick={() => { setDate(d => d.subtract(1, "day")); setRows([]); }} />
          <DatePicker
            value={date}
            onChange={d => { if (d) { setDate(d); setRows([]); } }}
            format="DD/MM/YYYY"
            allowClear={false}
            style={{ width: 130 }}
          />
          <Button icon={<RightOutlined />} onClick={() => { setDate(d => d.add(1, "day")); setRows([]); }} />
        </Space.Compact>

        {[1, 2, 3].map(s => (
          <Button
            key={s}
            type={shift === s ? "primary" : "default"}
            onClick={() => { setShift(s); setRows([]); }}
            style={{ minWidth: 58 }}
          >
            Ca {s}
          </Button>
        ))}

        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={handleLoad}
          loading={fetching}
          disabled={!processId}
        >
          Tải danh sách
        </Button>
      </Space>

      {/* Thống kê + action buttons */}
      {rows.length > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 10, flexWrap: "wrap", gap: 8,
        }}>
          <Space size="large">
            <Statistic
              title="Đã nhập"
              value={enteredCount}
              suffix={`/ ${rows.length} bản ghi (${primaryCount} máy)`}
            />
            <Divider type="vertical" style={{ height: 36 }} />
            <Statistic
              title={`Tổng SL Ca ${shift}`}
              value={totalKg.toLocaleString("vi-VN")}
              suffix="kg"
            />
          </Space>

          <Space>
            <Button onClick={handleFillStopped} disabled={rows.length === 0 || isReadOnly}>
              Chưa nhập → Dừng
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              disabled={dirtyCount === 0 || isReadOnly}
              onClick={handleSave}
            >
              Lưu tất cả ({dirtyCount} bản ghi)
            </Button>
          </Space>
        </div>
      )}

      {/* Gợi ý */}
      {rows.length > 0 && (
        <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <KeyOutlined style={{ fontSize: 13 }} />
          Mẹo: Bôi đen cột <b>SẢN LƯỢNG CA</b> trong Excel → Ctrl+C → Click ô đầu → <b>Ctrl+V</b>
          <span style={{ marginLeft: 8, color: "#b0b0b0" }}>|</span>
          <PlusOutlined style={{ fontSize: 11, color: "#1677ff" }} />
          <span>Bấm <b style={{ color: "#1677ff" }}>+</b> để thêm dòng đổi mặt hàng giữa ca</span>
        </div>
      )}

      {/* Bảng nhập liệu */}
      {fetching ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>
      ) : rows.length > 0 ? (
        <Table
          dataSource={rows}
          size="small"
          pagination={false}
          rowKey={r => r.rowKey}
          columns={columns}
          rowClassName={r => {
            if (r.isStopped) return "row-stopped";
            if (r.isDirty) return "ant-table-row-selected";
            if (r.endIndex !== null) return "row-done";
            if (r.isSubRow) return "row-subrow";
            return "";
          }}
          scroll={{ x: 1000 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={7}>
                <b>Tổng cộng Ca {shift}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7}>
                <b style={{ color: "#1677ff", fontSize: 15 }}>
                  {totalKg.toLocaleString("vi-VN")} kg
                </b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} colSpan={5} />
            </Table.Summary.Row>
          )}
        />
      ) : (
        !fetching && processId && (
          <Alert
            type="info"
            message="Chưa tải dữ liệu"
            description={`Đã chọn công đoạn và Ca ${shift}. Bấm "Tải danh sách" để bắt đầu nhập liệu.`}
            showIcon
          />
        )
      )}

      {!processId && (
        <Alert
          type="info"
          message="Hướng dẫn"
          description="Chọn Nhà máy → Công đoạn → Ngày → Ca → Bấm 'Tải danh sách' để bắt đầu nhập sản lượng theo ca."
          showIcon
        />
      )}

      <style>{`
        .row-done td { background: #f6ffed !important; }
        .row-stopped td { background: #fffbe6 !important; opacity: 0.85; }
        .row-subrow td { background: #f5f0ff !important; }
        .row-subrow:hover td { background: #ede6ff !important; }
      `}</style>
    </div>
  );
}
