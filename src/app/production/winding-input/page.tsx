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
  message,
  Statistic,
  Spin,
  Popconfirm,
  Divider,
  Tooltip,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  DownOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { detectShiftAndDate } from "@/lib/production-utils";
import { useProductionMetadata } from "@/hooks/useProductionMetadata";
import type {
  Factory,
  Process,
  ItemOption,
  LotOption,
  MachineAssignment,
  MachineForInput,
  ProductionLogEntry,
} from "@/types/production";

// ============================================================
// Types nội bộ trang
// ============================================================
interface WindingRow {
  _uid: string;       // Unique key cho mỗi row
  machineId: number;
  machineName: string;
  itemId: number;
  itemName: string;
  lotId: number | null;
  lotNumber: string | null;
  outputKg: number | null;
  note: string;
  isDirty: boolean;
  existingLogId?: number;
  isExtra?: boolean;      // Dòng thêm giữa ca (không có trong assignment)
  originalItemId?: number; // Item gốc từ assignment — dùng để detect thay đổi
  originalLotId?: number | null;
  sourceProcessId?: number | null;
  sourceProcess?: SourceOption | null;
  fallbackSourceProcess?: SourceOption | null;
  editMode?: boolean;      // Đang trong chế độ sửa mặt hàng
}

interface SourceOption {
  id: number;
  name: string;
  revenueFactory?: { id: number; name: string } | null;
}

let _uidCounter = 0;
const nextUid = () => `wr-${++_uidCounter}`;
const assignmentSourceKey = (machineId: number, itemId: number, lotId?: number | null) =>
  `${machineId}-${itemId}-${lotId ?? "no-lot"}`;

// ============================================================
// Main Page
// ============================================================
export default function WindingInputPage() {
  const { data: session } = useSession();
  const {
    factories,
    processes,
    items,
    lots,
    loading: metaLoading,
  } = useProductionMetadata();

  const su = session?.user as any;
  const isAdmin = su?.role === "ADMIN";
  const isReadOnly = !isAdmin && su?.accessLevel === "READ_ONLY";
  const ALLOWED_DELETE_ROLES = [
    "ADMIN",
    "DIRECTOR",
    "FACTORY_MANAGER",
    "STATISTICIAN",
  ];
  const canDelete =
    isAdmin ||
    (su?.userRole ? ALLOWED_DELETE_ROLES.includes(su.userRole) : false);

  // Filter states
  const [factoryId, setFactoryId] = useState<number | undefined>();
  const [processId, setProcessId] = useState<number | undefined>();
  const { shift: initShift, date: initDate } = useMemo(
    () => detectShiftAndDate(),
    [],
  );
  const [date, setDate] = useState<Dayjs>(initDate);
  const [shift, setShift] = useState<number>(initShift);

  // Data
  const [rows, setRows] = useState<WindingRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [machinesRaw, setMachinesRaw] = useState<MachineForInput[]>([]);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
  const [pendingSource, setPendingSource] = useState<Record<number, number | undefined>>({});
  const [pendingAssignmentSource, setPendingAssignmentSource] = useState<Record<string, number | undefined>>({});

  // Processes thuộc factory đã chọn
  const filteredProcesses = useMemo(() => {
    if (!factoryId) return [];
    return processes.filter((p) => p.factoryId === factoryId);
  }, [processes, factoryId]);

  // Auto chọn factory/process nếu user chỉ quản lý 1
  useEffect(() => {
    if (isAdmin || processes.length === 0) return;
    const rawIds = su?.processIds ?? [];
    const userProcessIds: number[] = Array.isArray(rawIds)
      ? rawIds.map(Number)
      : [];
    if (userProcessIds.length === 1) {
      const proc = processes.find((p) => userProcessIds.includes(p.id));
      if (proc) {
        setFactoryId(proc.factoryId);
        setProcessId(proc.id);
      }
    }
  }, [processes, isAdmin, su]);

  useEffect(() => {
    fetch("/api/processes/source-options")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSourceOptions(Array.isArray(data) ? data : []))
      .catch(() => setSourceOptions([]));
  }, []);

  // ============================================================
  // Load data
  // ============================================================
  const handleLoad = useCallback(async () => {
    if (!processId) {
      message.warning("Chọn công đoạn trước");
      return;
    }
    setFetching(true);
    try {
      const dateStr = date.format("YYYY-MM-DD");
      const res = await fetch(
        `/api/production/daily-status?processId=${processId}&date=${dateStr}&shift=${shift}`,
      );
      if (!res.ok) throw new Error();
      const allMachines: MachineForInput[] = await res.json();

      // Chỉ lấy máy multi-item
      const multiMachines = allMachines.filter((m) => m.allowMultiItemPerShift);
      setMachinesRaw(multiMachines);
      setPendingSource(
        Object.fromEntries(
          multiMachines.map((m) => [
            m.id,
            m.currentSourceProcessId ?? m.currentSourceProcess?.id ?? undefined,
          ]),
        ),
      );
      setPendingAssignmentSource(
        Object.fromEntries(
          multiMachines.flatMap((m) =>
            (m.itemAssignments || []).map((a) => [
              assignmentSourceKey(m.id, a.itemId, a.lotId ?? null),
              a.sourceProcessId ?? a.sourceProcess?.id ?? undefined,
            ]),
          ),
        ),
      );

      const newRows: WindingRow[] = [];

      for (const m of multiMachines) {
        const assignments = m.itemAssignments || [];
        const todayLogs = m.todayLogs || [];

        if (assignments.length === 0 && todayLogs.length === 0) {
          // Máy chưa có assignment và chưa có log → 1 dòng trống
          newRows.push({
            _uid: nextUid(),
            machineId: m.id,
            machineName: m.name,
            itemId: m.currentItem?.id || 0,
            itemName: m.currentItem?.name || "(chưa bố trí)",
            lotId: m.currentLot?.id || null,
            lotNumber: m.currentLot?.lotNumber || null,
            outputKg: null,
            note: "",
            isDirty: false,
            fallbackSourceProcess: m.currentSourceProcess ?? null,
          });
          continue;
        }

        if (todayLogs.length > 0) {
          // ĐÃ CÓ LOG → Build từ logs (ưu tiên dữ liệu lịch sử thực tế)
          // Không dùng assignments làm cấu trúc chính → tránh hiện sai item của ca khác
          for (const log of todayLogs) {
            // Tìm assignment tương ứng (nếu có) để biết dòng này có thể edit item không
            const assignment = assignments.find(
              (a) =>
                a.itemId === log.itemId &&
                (a.lotId ?? null) === (log.lotId ?? null),
            );
            newRows.push({
              _uid: nextUid(),
              machineId: m.id,
              machineName: m.name,
              itemId: log.itemId,
              itemName: log.item?.name || assignment?.item.name || `Item ${log.itemId}`,
              lotId: log.lotId ?? null,
              lotNumber: null,
              outputKg: log.finalOutput ?? null,
              note: log.note || "",
              isDirty: false,
              existingLogId: log.id,
              // Chỉ set originalItemId nếu item này vẫn còn trong assignment → cho phép ✏️
              originalItemId: assignment ? log.itemId : undefined,
              originalLotId: assignment?.lotId ?? null,
              sourceProcessId: assignment?.sourceProcessId ?? null,
              sourceProcess: assignment?.sourceProcess ?? null,
              fallbackSourceProcess: m.currentSourceProcess ?? null,
              // isExtra nếu item không còn trong assignment hiện tại
              isExtra: !assignment,
            });
          }
          // KHÔNG add unlogged assignment items → tránh hiện item của ca khác
        } else {
          // CHƯA CÓ LOG → Build từ assignments (template cho ca mới)
          for (const a of assignments) {
            newRows.push({
              _uid: nextUid(),
              machineId: m.id,
              machineName: m.name,
              itemId: a.itemId,
              itemName: a.item.name,
              lotId: a.lotId ?? a.lot?.id ?? null,
              lotNumber: a.lot?.lotNumber ?? null,
              outputKg: null,
              note: "",
              isDirty: false,
              originalItemId: a.itemId,
              originalLotId: a.lotId ?? null,
              sourceProcessId: a.sourceProcessId ?? null,
              sourceProcess: a.sourceProcess ?? null,
              fallbackSourceProcess: m.currentSourceProcess ?? null,
            });
          }
        }
      }

      setRows(newRows);
    } catch {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setFetching(false);
    }
  }, [processId, date, shift]);

  // Auto load khi đủ filter
  useEffect(() => {
    if (processId && date && shift) handleLoad();
  }, [processId, date, shift, handleLoad]);

  const handleChangeSource = async (
    machineId: number,
    newSourceProcessId?: number,
  ) => {
    if (!newSourceProcessId) {
      message.warning("Vui long chon nguon soi");
      return;
    }

    try {
      const res = await fetch(`/api/machines/${machineId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSourceProcessId: newSourceProcessId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Doi nguon soi that bai");
      }
      message.success("Da doi nguon soi. Log moi se ap dung nguon nay.");
      await handleLoad();
    } catch (error: any) {
      message.error(error.message || "Doi nguon soi that bai");
    }
  };

  const handleChangeAssignmentSource = async (
    machineId: number,
    itemId: number,
    lotId: number | null,
    newSourceProcessId?: number,
  ) => {
    if (!newSourceProcessId) {
      message.warning("Vui long chon nguon soi");
      return;
    }

    const machine = machinesRaw.find((m) => m.id === machineId);
    if (!machine?.itemAssignments?.length) {
      message.error("Khong tim thay phan cong mat hang cua may");
      return;
    }

    const newAssignments = machine.itemAssignments.map((a, i) => ({
      itemId: a.itemId,
      lotId: a.lotId ?? null,
      sourceProcessId:
        a.itemId === itemId && (a.lotId ?? null) === lotId
          ? newSourceProcessId
          : (a.sourceProcessId ?? null),
      sortOrder: a.sortOrder ?? i,
    }));

    try {
      const res = await fetch(`/api/machines/${machineId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: newAssignments }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Doi nguon soi that bai");
      }
      message.success("Da doi nguon soi cho mat hang. Log moi se ap dung nguon nay.");
      setPendingAssignmentSource((prev) => ({
        ...prev,
        [assignmentSourceKey(machineId, itemId, lotId)]: undefined,
      }));
      await handleLoad();
    } catch (error: any) {
      message.error(error.message || "Doi nguon soi that bai");
    }
  };

  // ============================================================
  // Row editing
  // ============================================================
  const updateRow = (uid: string, field: keyof WindingRow, value: any) => {
    setRows((prev) =>
      prev.map((r) =>
        r._uid === uid ? { ...r, [field]: value, isDirty: true } : r,
      ),
    );
  };

  // Bật chế độ sửa mặt hàng cho 1 dòng
  const enableEditMode = (uid: string) => {
    setRows((prev) =>
      prev.map((r) => (r._uid === uid ? { ...r, editMode: true } : r)),
    );
  };

  // Đổi mặt hàng assignment: cập nhật itemId + itemName, xóa lô (vì item đổi thì lô đổi)
  const changeRowItem = (uid: string, newItemId: number) => {
    const item = items.find((i) => i.id === newItemId);
    setRows((prev) =>
      prev.map((r) =>
        r._uid === uid
          ? {
              ...r,
              itemId: newItemId,
              itemName: item?.name || "",
              lotId: null,
              lotNumber: null,
              isDirty: true,
              editMode: false,
            }
          : r,
      ),
    );
  };

  const addExtraRow = (machineId: number) => {
    const machine = machinesRaw.find((m) => m.id === machineId);
    if (!machine) return;
    const newRow: WindingRow = {
      _uid: nextUid(),
      machineId,
      machineName: machine.name,
      itemId: 0,
      itemName: "",
      lotId: null,
      lotNumber: null,
      outputKg: null,
      note: "",
      isDirty: true,
      isExtra: true,
    };
    // Chèn ngay sau dòng cuối cùng của máy này (giữ rows liền kề cho rowSpan)
    setRows((prev) => {
      const lastIdx = prev.reduce(
        (acc, r, i) => (r.machineId === machineId ? i : acc),
        -1,
      );
      if (lastIdx === -1) return [...prev, newRow];
      const copy = [...prev];
      copy.splice(lastIdx + 1, 0, newRow);
      return copy;
    });
  };

  const removeExtraRow = (uid: string) => {
    setRows((prev) => prev.filter((r) => r._uid !== uid));
  };

  // ============================================================
  // Save — hỗ trợ đổi mặt hàng assignment
  // ============================================================
  const handleSave = async () => {
    const dirtyRows = rows.filter((r) => r.isDirty && r.itemId > 0);
    if (dirtyRows.length === 0) {
      message.info("Không có thay đổi");
      return;
    }

    setSaving(true);
    let savedCount = 0;
    let errorCount = 0;

    for (const r of dirtyRows) {
      try {
        const itemChanged =
          r.originalItemId !== undefined && r.originalItemId !== r.itemId;

        // Bước 1: Nếu item thay đổi và đã có log cũ → xóa log cũ trước
        if (itemChanged && r.existingLogId) {
          await fetch(`/api/production/daily-input?id=${r.existingLogId}`, {
            method: "DELETE",
          });
        }

        // Bước 2: Tạo / cập nhật log mới với item mới (hoặc item cũ nếu không đổi)
        const res = await fetch("/api/production/daily-input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machineId: r.machineId,
            recordDate: date.format("YYYY-MM-DD"),
            shift,
            itemId: r.itemId,
            startIndex: 0,
            endIndex: 0,
            inputNE: null,
            finalOutput: r.outputKg || 0,
            efficiency: null,
            note: r.note,
            lotId: r.lotId,
          }),
        });

        if (res.ok) {
          savedCount++;

          // Bước 3: Nếu item thay đổi → cập nhật MachineItemAssignment
          // PATCH endpoint đã bị bỏ (composite unique [machineId,itemId] không còn).
          // Dùng PUT thay-thế-toàn-bộ: map assignment cũ (theo originalItemId) sang item mới.
          if (itemChanged) {
            const machine = machinesRaw.find((m) => m.id === r.machineId);
            const current = (machine?.itemAssignments || []).map((a, i) => ({
              itemId: a.itemId,
              lotId: a.lotId ?? null,
              sourceProcessId: a.sourceProcessId ?? null,
              sortOrder: a.sortOrder ?? i,
            }));
            const newAssignments = current.map((a) =>
              a.itemId === r.originalItemId &&
              (a.lotId ?? null) === (r.originalLotId ?? null)
                ? { ...a, itemId: r.itemId, lotId: r.lotId ?? null }
                : a,
            );
            const putRes = await fetch(
              `/api/machines/${r.machineId}/assignments`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments: newAssignments }),
              },
            );
            if (!putRes.ok) {
              const errData = await putRes.json().catch(() => ({}));
              console.warn(
                `Assignment update failed (machineId=${r.machineId}):`,
                errData,
              );
              // Log đã được lưu rồi, chỉ cảnh báo về assignment
              message.warning(
                `Đã lưu sản lượng nhưng không thể cập nhật điều phối: ${errData.error || ""}`,
              );
            }
          }
        } else {
          errorCount++;
          const errData = await res.json().catch(() => ({}));
          console.error(`Lỗi save ${r.machineName} - ${r.itemName}:`, errData);
        }
      } catch {
        errorCount++;
      }
    }

    if (savedCount > 0) message.success(`Đã lưu ${savedCount} dòng`);
    if (errorCount > 0) message.error(`Lỗi ${errorCount} dòng`);

    setSaving(false);
    handleLoad(); // Reload để sync lại state
  };

  // ============================================================
  // Delete
  // ============================================================
  const handleDelete = async (logId: number) => {
    try {
      const res = await fetch(`/api/production/daily-input?id=${logId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        message.success("Đã xóa");
        handleLoad();
      } else {
        message.error("Lỗi xóa");
      }
    } catch {
      message.error("Lỗi xóa");
    }
  };

  // ============================================================
  // Statistics
  // ============================================================
  const totalOutput = useMemo(
    () => rows.reduce((sum, r) => sum + (r.outputKg || 0), 0),
    [rows],
  );

  const dirtyCount = useMemo(
    () => rows.filter((r) => r.isDirty).length,
    [rows],
  );

  // Group rows by machineId for display
  const machineIds = useMemo(() => {
    const ids: number[] = [];
    rows.forEach((r) => {
      if (!ids.includes(r.machineId)) ids.push(r.machineId);
    });
    return ids;
  }, [rows]);

  // Màu xen kẽ theo máy (chẵn/lẻ trong danh sách)
  const machineColorIndex = useMemo(() => {
    const map: Record<number, number> = {};
    machineIds.forEach((id, idx) => {
      map[id] = idx;
    });
    return map;
  }, [machineIds]);

  // ============================================================
  // Lots filtered by item
  // ============================================================
  const getLotsForItem = (itemId: number) =>
    lots.filter((l) => l.item?.id === itemId || !l.item);

  const renderRowSourceTag = (record: WindingRow) => {
    const source = record.sourceProcess ?? record.fallbackSourceProcess;
    const sourceKey = assignmentSourceKey(record.machineId, record.itemId, record.lotId);
    const label = record.sourceProcess
      ? source?.name
      : source
        ? `${source.name} (mac dinh)`
        : "Chua gan";

    if (record.isExtra || record.originalItemId === undefined) {
      return (
        <Tag color={source ? "blue" : "red"} style={{ fontSize: 11, marginTop: 4 }}>
          Nguon: {label}
        </Tag>
      );
    }

    return (
      <Popconfirm
        title={`Doi nguon soi cho ${record.itemName}`}
        description={
          <div style={{ minWidth: 240, paddingTop: 8 }}>
            <Select
              size="small"
              style={{ width: "100%" }}
              placeholder="Chon nguon soi"
              value={pendingAssignmentSource[sourceKey] ?? record.sourceProcessId ?? undefined}
              onChange={(v) =>
                setPendingAssignmentSource((prev) => ({
                  ...prev,
                  [sourceKey]: v,
                }))
              }
              options={sourceOptions.map((p) => ({
                label: `${p.name} -> ${p.revenueFactory?.name || "?"}`,
                value: p.id,
              }))}
            />
            <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
              Chi ap dung cho mat hang nay tren may nay. Log moi tao sau khi doi
              se snapshot nguon soi nay.
            </div>
          </div>
        }
        onConfirm={() =>
          handleChangeAssignmentSource(
            record.machineId,
            record.itemId,
            record.lotId,
            pendingAssignmentSource[sourceKey] ?? record.sourceProcessId ?? undefined,
          )
        }
        okText="Xac nhan"
        cancelText="Huy"
        disabled={isReadOnly}
      >
        <Tag
          color={record.sourceProcess ? "cyan" : source ? "blue" : "red"}
          style={{ cursor: isReadOnly ? "default" : "pointer", fontSize: 11, marginTop: 4 }}
        >
          Nguon: {label}
          {!isReadOnly && <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />}
        </Tag>
      </Popconfirm>
    );
  };

  // ============================================================
  // Render
  // ============================================================
  const columns = [
    {
      title: "Máy",
      dataIndex: "machineName",
      width: 110,
      render: (val: string, record: WindingRow, index: number) => {
        const rowsOfMachine = rows.filter(
          (r) => r.machineId === record.machineId,
        );
        const firstIndex = rows.findIndex(
          (r) => r.machineId === record.machineId,
        );
        const currentMachine = machinesRaw.find((m) => m.id === record.machineId);
        if (index === firstIndex) {
          return {
            children: (
              <div>
                <strong>{val}</strong>
                <div style={{ marginTop: 4 }}>
                  <Popconfirm
                    title="Doi nguon soi"
                    description={
                      <div style={{ minWidth: 240, paddingTop: 8 }}>
                        <Select
                          size="small"
                          style={{ width: "100%" }}
                          placeholder="Chon nguon soi"
                          value={pendingSource[record.machineId]}
                          onChange={(v) =>
                            setPendingSource((prev) => ({
                              ...prev,
                              [record.machineId]: v,
                            }))
                          }
                          options={sourceOptions.map((p) => ({
                            label: `${p.name} -> ${p.revenueFactory?.name || "?"}`,
                            value: p.id,
                          }))}
                        />
                        <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
                          Log moi tao sau khi doi se snapshot nguon soi nay.
                        </div>
                      </div>
                    }
                    onConfirm={() =>
                      handleChangeSource(
                        record.machineId,
                        pendingSource[record.machineId],
                      )
                    }
                    okText="Xac nhan"
                    cancelText="Huy"
                    disabled={isReadOnly}
                  >
                    <Tag color={currentMachine?.currentSourceProcess ? "cyan" : "red"} style={{ cursor: isReadOnly ? "default" : "pointer", marginTop: 4 }}>
                      Nguon: {currentMachine?.currentSourceProcess?.name || "Chua gan"}
                      {!isReadOnly && <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />}
                    </Tag>
                  </Popconfirm>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => addExtraRow(record.machineId)}
                    disabled={isReadOnly}
                  >
                    Chuyển đổi giữa ca
                  </Button>
                </div>
              </div>
            ),
            props: { rowSpan: rowsOfMachine.length },
          };
        }
        return { children: null, props: { rowSpan: 0 } };
      },
    },
    {
      title: "Mặt hàng",
      dataIndex: "itemName",
      width: 200,
      render: (val: string, record: WindingRow) => {
        // Dòng thêm mới chưa chọn item → Select để chọn
        if (record.isExtra && record.itemId === 0) {
          return (
            <Select
              size="small"
              style={{ width: "100%" }}
              placeholder="Chọn mặt hàng"
              showSearch
              optionFilterProp="children"
              onChange={(v: number) => {
                const item = items.find((i) => i.id === v);
                const existing = rows.find(
                  (r) =>
                    r.machineId === record.machineId &&
                    r.itemId === v &&
                    r._uid !== record._uid,
                );
                if (existing) {
                  message.warning("Mặt hàng đã có trong danh sách máy này");
                  return;
                }
                setRows((prev) =>
                  prev.map((r) =>
                    r._uid === record._uid
                      ? { ...r, itemId: v, itemName: item?.name || "", isDirty: true }
                      : r,
                  ),
                );
              }}
            >
              {items.map((i) => (
                <Select.Option key={i.id} value={i.id}>
                  {i.name}
                </Select.Option>
              ))}
            </Select>
          );
        }

        // Đang trong chế độ sửa mặt hàng assignment
        if (record.editMode) {
          return (
            <Select
              size="small"
              style={{ width: "100%" }}
              defaultValue={record.itemId}
              showSearch
              optionFilterProp="children"
              autoFocus
              onChange={(v: number) => {
                // Kiểm tra trùng với dòng khác của cùng máy
                const existing = rows.find(
                  (r) =>
                    r.machineId === record.machineId &&
                    r.itemId === v &&
                    r._uid !== record._uid,
                );
                if (existing) {
                  message.warning("Mặt hàng đã có trong danh sách máy này");
                  return;
                }
                changeRowItem(record._uid, v);
              }}
              onBlur={() =>
                setRows((prev) =>
                  prev.map((r) =>
                    r._uid === record._uid ? { ...r, editMode: false } : r,
                  ),
                )
              }
            >
              {items.map((i) => (
                <Select.Option key={i.id} value={i.id}>
                  {i.name}
                </Select.Option>
              ))}
            </Select>
          );
        }

        // Hiển thị bình thường + nút ✏️ sửa (chỉ cho dòng từ assignment)
        const itemChanged =
          record.originalItemId !== undefined &&
          record.originalItemId !== record.itemId;
        return (
          <div>
          <Space size={4} wrap>
            <Tag color={itemChanged ? "orange" : "blue"}>{val}</Tag>
            {!record.isExtra && !isReadOnly && (
              <Tooltip title="Đổi mặt hàng">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => enableEditMode(record._uid)}
                  style={{ color: "#888", padding: "0 2px" }}
                />
              </Tooltip>
            )}
            {itemChanged && (
              <Tag color="orange" style={{ fontSize: 10 }}>
                Đã đổi
              </Tag>
            )}
          </Space>
          <div>{renderRowSourceTag(record)}</div>
          </div>
        );
      },
    },
    {
      title: "Lô",
      dataIndex: "lotNumber",
      width: 150,
      render: (_: any, record: WindingRow) => {
        const lotOptions = getLotsForItem(record.itemId);
        return (
          <Select
            size="small"
            style={{ width: "100%" }}
            value={record.lotId}
            allowClear
            placeholder="Chọn lô"
            disabled={isReadOnly}
            onChange={(v: number | undefined) => {
              const lot = lots.find((l) => l.id === v);
              setRows((prev) =>
                prev.map((r) =>
                  r._uid === record._uid
                    ? {
                        ...r,
                        lotNumber: lot?.lotNumber ?? null,
                        lotId: v ?? null,
                        isDirty: true,
                      }
                    : r,
                ),
              );
            }}
          >
            {lotOptions.map((l) => (
              <Select.Option key={l.id} value={l.id}>
                {l.lotNumber}
              </Select.Option>
            ))}
          </Select>
        );
      },
    },
    {
      title: "Sản lượng (kg)",
      dataIndex: "outputKg",
      width: 130,
      render: (_: any, record: WindingRow) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          value={record.outputKg}
          disabled={isReadOnly}
          onChange={(v) => updateRow(record._uid, "outputKg", v)}
        />
      ),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      width: 150,
      render: (_: any, record: WindingRow) => (
        <Input
          size="small"
          value={record.note}
          disabled={isReadOnly}
          onChange={(e) => updateRow(record._uid, "note", e.target.value)}
        />
      ),
    },
    {
      title: "",
      width: 60,
      render: (_: any, record: WindingRow) => {
        if (record.isExtra && record.itemId === 0) {
          return (
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeExtraRow(record._uid)}
            />
          );
        }
        if (record.existingLogId && canDelete) {
          return (
            <Popconfirm
              title="Xóa bản ghi này?"
              onConfirm={() => handleDelete(record.existingLogId!)}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>Nhập liệu đánh ống</h2>

      {/* Filter bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          placeholder="Nhà máy"
          value={factoryId}
          onChange={(v) => {
            setFactoryId(v);
            setProcessId(undefined);
          }}
        >
          {factories.map((f) => (
            <Select.Option key={f.id} value={f.id}>
              {f.name}
            </Select.Option>
          ))}
        </Select>

        <Select
          style={{ width: 200 }}
          placeholder="Công đoạn"
          value={processId}
          onChange={(v) => setProcessId(v)}
          disabled={!factoryId}
        >
          {filteredProcesses.map((p) => (
            <Select.Option key={p.id} value={p.id}>
              {p.name}
            </Select.Option>
          ))}
        </Select>

        <DatePicker
          value={date}
          onChange={(v) => v && setDate(v)}
          format="DD/MM/YYYY"
        />

        <Select style={{ width: 90 }} value={shift} onChange={setShift}>
          <Select.Option value={1}>Ca 1</Select.Option>
          <Select.Option value={2}>Ca 2</Select.Option>
          <Select.Option value={3}>Ca 3</Select.Option>
        </Select>

        <Button
          icon={<ReloadOutlined />}
          onClick={handleLoad}
          loading={fetching}
        >
          Tải lại
        </Button>
      </Space>

      {/* Stats bar */}
      <Space style={{ marginBottom: 12 }} size="large">
        <Statistic title="Tổng SL (kg)" value={totalOutput} precision={0} />
        <Statistic title="Số máy" value={machineIds.length} />
        {dirtyCount > 0 && <Tag color="orange">{dirtyCount} dòng chưa lưu</Tag>}
      </Space>

      <Divider style={{ margin: "8px 0" }} />

      {/* Save button */}
      <div style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={isReadOnly || dirtyCount === 0}
        >
          Lưu tất cả ({dirtyCount})
        </Button>
      </div>

      {/* Table */}
      <Spin spinning={fetching}>
        <Table
          columns={columns}
          dataSource={rows}
          rowKey={(r) => r._uid}
          pagination={false}
          size="small"
          bordered
          rowClassName={(r) => {
            if (r.isDirty) return "winding-row-dirty";
            const colorIdx = machineColorIndex[r.machineId] ?? 0;
            return colorIdx % 2 === 0 ? "winding-row-even" : "winding-row-odd";
          }}
          locale={{
            emptyText: processId
              ? "Không có máy đánh ống multi-item"
              : "Chọn nhà máy và công đoạn",
          }}
        />
      </Spin>

      <style jsx global>{`
        .winding-row-even td {
          background-color: #ffffff !important;
        }
        .winding-row-odd td {
          background-color: #f0f7ff !important;
        }
        .winding-row-dirty td {
          background-color: #fff7e6 !important;
          border-left: 3px solid #faad14 !important;
        }
      `}</style>
    </div>
  );
}
