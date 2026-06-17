"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import {
  Button,
  InputNumber,
  Select,
  message,
  Tag,
  Spin,
  Result,
  Modal,
  Progress,
  Radio,
  Popconfirm,
} from "antd";
import {
  SaveOutlined,
  CheckCircleOutlined,
  LeftOutlined,
  RightOutlined,
  HomeOutlined,
  PlusOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  EditOutlined,
  SwapOutlined,
  DownOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { detectShiftAndDate } from "@/lib/production-utils";
import { naturalSortBy } from "@/utils/naturalSort";

// ============================
// TYPES
// ============================
interface WAssignment {
  itemId: number;
  item: { id: number; name: string };
  lotId?: number | null;
  lot?: { id: number; lotNumber: string } | null;
  sortOrder: number;
}

interface WMachine {
  id: number;
  name: string;
  processId: number;
  allowMultiItemPerShift?: boolean;
  currentSourceProcessId?: number | null;
  currentSourceProcess?: SourceOption | null;
  currentItem?: { id: number; name: string };
  currentLot?: { id: number; lotNumber: string } | null;
  itemAssignments?: WAssignment[];
  todayLogs?: Array<{
    id: number;
    itemId: number;
    item?: { id: number; name: string };
    finalOutput: number | null;
    lotId?: number | null;
    lot?: { id: number; lotNumber: string } | null;
    note?: string;
  }>;
}

interface ItemInput {
  _uid: string;
  itemId: number;
  itemName: string;
  lotId: number | null;
  lotNumber: string | null;
  outputKg: number | null;
  note: string;
  isDirty: boolean;
  isExtra: boolean; // MH đã đổi/dừng giữa ca (chỉ còn trong log, không còn trong assignment)
  existingLogId?: number;
  // Gốc trong assignment hiện tại — dùng để map khi PUT lại assignment
  originalItemId?: number;
  originalLotId?: number | null;
}

interface Process {
  id: number;
  name: string;
  factoryId: number;
}
interface Item {
  id: number;
  name: string;
}
interface LotOption {
  id: number;
  lotNumber: string;
  item?: { id: number; name: string } | null;
}
interface SourceOption {
  id: number;
  name: string;
  revenueFactory?: { id: number; name: string } | null;
}
interface SessionUserShape {
  role?: string | null;
  accessLevel?: string | null;
  processIds?: Array<number | string>;
}
interface AssignmentPayload {
  itemId: number;
  lotId: number | null;
  sortOrder: number;
}

// Mode cho modal thao tác giữa ca
type ShiftActionMode = "correction" | "change" | "add";

let _uid = 0;
const uid = () => `wi-${++_uid}`;

const SHIFT_LABEL: Record<number, string> = { 1: "Ca 1", 2: "Ca 2", 3: "Ca 3" };

// Chuẩn hóa so sánh lotId (undefined/null đều coi là null)
const sameLot = (a: number | null | undefined, b: number | null | undefined) =>
  (a ?? null) === (b ?? null);
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// ============================
// MAIN COMPONENT
// ============================
function MobileWindingContent() {
  const { data: session, status } = useSession();
  const sessionUser = session?.user as SessionUserShape | undefined;
  const searchParams = useSearchParams();
  const router = useRouter();

  const paramProcessId = searchParams.get("processId");

  const { shift: initShift, date: initDate } = useMemo(
    () => detectShiftAndDate(),
    [],
  );
  const [selectedShift, setSelectedShift] = useState(initShift);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(initDate);

  // Modal đổi ngày/ca
  const [dateShiftModalOpen, setDateShiftModalOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Dayjs>(initDate);
  const [tempShift, setTempShift] = useState(initShift);

  // Metadata
  const [processes, setProcesses] = useState<Process[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [allLots, setAllLots] = useState<LotOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);

  // State chọn công đoạn
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
    paramProcessId ? parseInt(paramProcessId) : null,
  );

  // Danh sách máy
  const [machines, setMachines] = useState<WMachine[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Items của từng máy: machineId → ItemInput[]
  const [machineItems, setMachineItems] = useState<Record<number, ItemInput[]>>(
    {},
  );

  // UI
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSavedKg, setLastSavedKg] = useState(0);
  const machineBarRef = useRef<HTMLDivElement>(null);

  // ============================
  // MODAL THAO TÁC GIỮA CA (Sửa sai / Đổi / Thêm)
  // ============================
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    mode: ShiftActionMode | null;
    row: ItemInput | null;
  }>({ open: false, mode: null, row: null });
  const [actionSaving, setActionSaving] = useState(false);

  // Fields trong modal
  const [mNewItemId, setMNewItemId] = useState<number | null>(null);
  const [mNewLotId, setMNewLotId] = useState<number | null>(null);
  const [mOldOutputKg, setMOldOutputKg] = useState<number | null>(null);
  const [mChangeMode, setMChangeMode] = useState<"switch" | "stop">("switch");
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<number | undefined>();
  const [sourceSaving, setSourceSaving] = useState(false);

  // ============================
  // FETCH METADATA
  // ============================
  useEffect(() => {
    if (status === "loading" || status === "unauthenticated") return;
    const load = async () => {
      try {
        const [pRes, iRes, lRes] = await Promise.all([
          fetch("/api/processes"),
          fetch("/api/items"),
          fetch("/api/lots"),
        ]);
        if (iRes.ok) setAllItems(await iRes.json());
        if (lRes.ok) setAllLots(await lRes.json());
        if (pRes.ok) {
          const allProc: Process[] = await pRes.json();
          const userProcessIds: number[] =
            sessionUser?.processIds?.map(Number) || [];
          const isAdmin = sessionUser?.role === "ADMIN";
          const visible =
            isAdmin || userProcessIds.length === 0
              ? allProc
              : allProc.filter((p) => userProcessIds.includes(p.id));
          setProcesses(visible);
          if (!paramProcessId && visible.length === 1) {
            setSelectedProcessId(visible[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [status, session]);

  useEffect(() => {
    if (status === "loading" || status === "unauthenticated") return;
    fetch("/api/processes/source-options")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSourceOptions(Array.isArray(data) ? data : []))
      .catch(() => setSourceOptions([]));
  }, [status]);

  // ============================
  // FETCH MACHINES
  // ============================
  const fetchMachines = async (
    processId: number,
    date: Dayjs,
    shift: number,
    keepIdx = false,
  ) => {
    setLoading(true);
    try {
      const dateStr = date.format("YYYY-MM-DD");
      const res = await fetch(
        `/api/production/daily-status?processId=${processId}&date=${dateStr}&shift=${shift}`,
      );
      if (!res.ok) throw new Error();
      const all: WMachine[] = await res.json();
      const multiMachines = all
        .filter((m) => m.allowMultiItemPerShift)
        .sort((a, b) => naturalSortBy(a.name, b.name));
      setMachines(multiMachines);
      if (!keepIdx) setCurrentIdx(0);
      buildMachineItems(multiMachines);
    } catch {
      message.error("Lỗi tải danh sách máy");
    } finally {
      setLoading(false);
    }
  };

  // Reload giữ nguyên máy đang xem (dùng sau khi thao tác giữa ca)
  const reloadMachines = async () => {
    if (selectedProcessId)
      await fetchMachines(selectedProcessId, selectedDate, selectedShift, true);
  };

  const openSourceModal = () => {
    if (!currentMachine) return;
    setPendingSourceId(
      currentMachine.currentSourceProcessId ??
        currentMachine.currentSourceProcess?.id ??
        undefined,
    );
    setSourceModalOpen(true);
  };

  const handleChangeSource = async () => {
    if (!currentMachine) return;
    if (!pendingSourceId) {
      message.warning("Vui long chon nguon soi");
      return;
    }

    setSourceSaving(true);
    try {
      const res = await fetch(`/api/machines/${currentMachine.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSourceProcessId: pendingSourceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Doi nguon soi that bai");
      }
      message.success("Da doi nguon soi. Log moi se ap dung nguon nay.");
      setSourceModalOpen(false);
      await reloadMachines();
    } catch (e: unknown) {
      message.error(getErrorMessage(e, "Doi nguon soi that bai"));
    } finally {
      setSourceSaving(false);
    }
  };

  useEffect(() => {
    if (selectedProcessId)
      fetchMachines(selectedProcessId, selectedDate, selectedShift);
  }, [selectedProcessId]);

  // Re-fetch khi đổi ca/ngày
  const handleConfirmDateShift = async () => {
    setSelectedDate(tempDate);
    setSelectedShift(tempShift);
    setDateShiftModalOpen(false);
    if (selectedProcessId) {
      await fetchMachines(selectedProcessId, tempDate, tempShift);
    }
  };

  // ============================
  // BUILD ITEM STATE FROM API DATA
  // ============================
  // Merge logs ∪ assignments:
  //  - Mỗi assignment → tìm log match (itemId, lotId). Có log → ô đã nhập; chưa → slot rỗng.
  //  - Log còn lại không match assignment nào → dòng isExtra (MH đã đổi/dừng giữa ca).
  const buildMachineItems = (machineList: WMachine[]) => {
    const map: Record<number, ItemInput[]> = {};
    for (const m of machineList) {
      const assignments = m.itemAssignments || [];
      const logs = m.todayLogs || [];
      const items: ItemInput[] = [];
      const usedLogIds = new Set<number>();

      // 1. Đi qua TẤT CẢ assignments theo sortOrder
      for (const a of assignments) {
        const log = logs.find(
          (l) => l.itemId === a.itemId && sameLot(l.lotId, a.lotId),
        );
        if (log) {
          usedLogIds.add(log.id);
          items.push({
            _uid: uid(),
            itemId: a.itemId,
            itemName: a.item?.name ?? log.item?.name ?? "",
            lotId: a.lotId ?? null,
            lotNumber: a.lot?.lotNumber ?? log.lot?.lotNumber ?? null,
            outputKg: log.finalOutput ?? null,
            note: log.note || "",
            isDirty: false,
            isExtra: false,
            existingLogId: log.id,
            originalItemId: a.itemId,
            originalLotId: a.lotId ?? null,
          });
        } else {
          items.push({
            _uid: uid(),
            itemId: a.itemId,
            itemName: a.item?.name ?? "",
            lotId: a.lotId ?? null,
            lotNumber: a.lot?.lotNumber ?? null,
            outputKg: null,
            note: "",
            isDirty: false,
            isExtra: false,
            existingLogId: undefined,
            originalItemId: a.itemId,
            originalLotId: a.lotId ?? null,
          });
        }
      }

      // 2. Các log CÒN LẠI (không match assignment) → MH đã đổi/dừng giữa ca
      for (const log of logs) {
        if (usedLogIds.has(log.id)) continue;
        items.push({
          _uid: uid(),
          itemId: log.itemId,
          itemName: log.item?.name ?? "",
          lotId: log.lotId ?? null,
          lotNumber: log.lot?.lotNumber ?? null,
          outputKg: log.finalOutput ?? null,
          note: log.note || "",
          isDirty: false,
          isExtra: true,
          existingLogId: log.id,
          originalItemId: undefined,
          originalLotId: undefined,
        });
      }

      // 3. Không có log lẫn assignment → 1 slot trống theo currentItem
      if (items.length === 0) {
        items.push({
          _uid: uid(),
          itemId: m.currentItem?.id || 0,
          itemName: m.currentItem?.name || "",
          lotId: m.currentLot?.id || null,
          lotNumber: m.currentLot?.lotNumber || null,
          outputKg: null,
          note: "",
          isDirty: false,
          isExtra: false,
        });
      }

      map[m.id] = items;
    }
    setMachineItems(map);
  };

  // ============================
  // ITEM EDIT HELPERS
  // ============================
  const updateItem = (
    machineId: number,
    itemUid: string,
    patch: Partial<ItemInput>,
  ) => {
    setMachineItems((prev) => ({
      ...prev,
      [machineId]: prev[machineId].map((it) =>
        it._uid === itemUid ? { ...it, ...patch, isDirty: true } : it,
      ),
    }));
  };

  // Build danh sách assignment hiện tại của máy (để PUT lại)
  const getCurrentAssignments = (machine: WMachine) =>
    (machine.itemAssignments || []).map((a, i) => ({
      itemId: a.itemId,
      lotId: a.lotId ?? null,
      sortOrder: a.sortOrder ?? i,
    }));

  // PUT assignment cho máy
  const putAssignments = async (
    machineId: number,
    assignments: AssignmentPayload[],
  ) => {
    const res = await fetch(`/api/machines/${machineId}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Lỗi cập nhật điều phối");
    }
  };

  // POST log (upsert theo máy+ngày+ca+item+lô)
  const postLog = async (
    machineId: number,
    itemId: number,
    lotId: number | null,
    finalOutput: number,
    note: string,
  ) => {
    const res = await fetch("/api/production/daily-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId,
        recordDate: selectedDate.format("YYYY-MM-DD"),
        shift: selectedShift,
        itemId,
        startIndex: 0,
        endIndex: 0,
        inputNE: null,
        finalOutput,
        efficiency: null,
        note,
        lotId,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.error || "Lỗi lưu sản lượng");
    }
  };

  const deleteLog = async (logId: number) => {
    await fetch(`/api/production/daily-input?id=${logId}`, {
      method: "DELETE",
    });
  };

  // ============================
  // SAVE (chỉ POST log — không còn đụng assignment)
  // ============================
  const handleSave = async (andNext: boolean = false) => {
    const machine = machines[currentIdx];
    if (!machine) return;

    const items = machineItems[machine.id] || [];
    const dirtyItems = items.filter((it) => it.isDirty && it.itemId > 0);
    if (dirtyItems.length === 0) {
      if (andNext) goNext();
      return;
    }

    setSaving(true);
    let ok = 0,
      fail = 0;

    for (const it of dirtyItems) {
      try {
        await postLog(
          machine.id,
          it.itemId,
          it.lotId,
          it.outputKg || 0,
          it.note,
        );
        ok++;
      } catch {
        fail++;
      }
    }

    setSaving(false);

    if (fail > 0) {
      message.error(`Lỗi ${fail} dòng`);
      return;
    }

    const totalKg = items.reduce((s, it) => s + (it.outputKg || 0), 0);
    setMachineItems((prev) => ({
      ...prev,
      [machine.id]: prev[machine.id].map((it) => ({ ...it, isDirty: false })),
    }));

    if (andNext) {
      setLastSavedKg(totalKg);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        goNext();
      }, 700);
    } else {
      message.success(`Đã lưu ${ok} mặt hàng!`);
    }
  };

  // ============================
  // MODAL THAO TÁC GIỮA CA
  // ============================
  const openActionModal = (mode: ShiftActionMode, row: ItemInput | null) => {
    setActionModal({ open: true, mode, row });
    setMNewItemId(null);
    setMNewLotId(null);
    setMOldOutputKg(row?.outputKg ?? null);
    setMChangeMode("switch");
  };

  const closeActionModal = () => {
    setActionModal({ open: false, mode: null, row: null });
  };

  // Kiểm tra trùng (item, lot) với dòng khác trên cùng máy
  const checkConflict = (
    newItemId: number,
    newLotId: number | null,
    excludeRow: ItemInput | null,
  ): boolean => {
    const conflict = currentItems.find(
      (other) =>
        other !== excludeRow &&
        other.itemId === newItemId &&
        sameLot(other.lotId, newLotId),
    );
    if (conflict) {
      const itemName = allItems.find((i) => i.id === newItemId)?.name ?? "MH";
      if (newLotId == null) {
        message.error(
          `Máy này đang có dòng "${itemName}" khác chưa chọn lô. Vui lòng chọn lô cụ thể cho cả 2 dòng để phân biệt.`,
        );
      } else {
        message.error(
          `Cặp mặt hàng "${itemName}" + lô đã tồn tại trên máy này.`,
        );
      }
      return true;
    }
    return false;
  };

  const submitActionModal = async () => {
    const machine = currentMachine;
    if (!machine || !actionModal.mode) return;
    const row = actionModal.row;

    setActionSaving(true);
    try {
      if (actionModal.mode === "correction") {
        // ✏️ Sửa sai — MH cũ chưa từng chạy
        if (!mNewItemId) {
          message.error("Vui lòng chọn mặt hàng mới");
          setActionSaving(false);
          return;
        }
        if (checkConflict(mNewItemId, mNewLotId, row)) {
          setActionSaving(false);
          return;
        }
        // 1. Xóa log cũ nếu lỡ nhập
        if (row?.existingLogId) await deleteLog(row.existingLogId);
        // 2. PUT assignment thay dòng cũ
        const newAssignments = getCurrentAssignments(machine).map((a) =>
          a.itemId === row?.originalItemId &&
          sameLot(a.lotId, row?.originalLotId)
            ? {
                ...a,
                itemId: mNewItemId,
                lotId: mNewLotId,
              }
            : a,
        );
        await putAssignments(machine.id, newAssignments);
        message.success("Đã sửa mặt hàng");
      } else if (actionModal.mode === "change") {
        // 🔄 Đổi giữa ca — MH cũ đã chạy một phần
        if (mOldOutputKg == null || mOldOutputKg <= 0) {
          message.error("Vui lòng nhập sản lượng đã chạy của mặt hàng cũ");
          setActionSaving(false);
          return;
        }
        if (mChangeMode === "switch") {
          if (!mNewItemId) {
            message.error("Vui lòng chọn mặt hàng mới");
            setActionSaving(false);
            return;
          }
          if (checkConflict(mNewItemId, mNewLotId, row)) {
            setActionSaving(false);
            return;
          }
        }
        // 1. LƯU SẢN LƯỢNG MH CŨ TRƯỚC (upsert)
        await postLog(
          machine.id,
          row!.itemId,
          row!.lotId,
          mOldOutputKg,
          row?.note || "Đã đổi/dừng giữa ca",
        );
        // 2. PUT assignment
        let newAssignments;
        if (mChangeMode === "switch") {
          newAssignments = getCurrentAssignments(machine).map((a) =>
            a.itemId === row?.originalItemId &&
            sameLot(a.lotId, row?.originalLotId)
              ? {
                  ...a,
                  itemId: mNewItemId!,
                  lotId: mNewLotId,
                }
              : a,
          );
        } else {
          // Dừng hẳn → lọc bỏ dòng cũ
          newAssignments = getCurrentAssignments(machine).filter(
            (a) =>
              !(
                a.itemId === row?.originalItemId &&
                sameLot(a.lotId, row?.originalLotId)
              ),
          );
        }
        await putAssignments(machine.id, newAssignments);
        message.success(
          mChangeMode === "switch" ? "Đã đổi mặt hàng" : "Đã dừng mặt hàng",
        );
      } else if (actionModal.mode === "add") {
        // ➕ Thêm song song
        if (!mNewItemId) {
          message.error("Vui lòng chọn mặt hàng");
          setActionSaving(false);
          return;
        }
        if (checkConflict(mNewItemId, mNewLotId, null)) {
          setActionSaving(false);
          return;
        }
        const current = getCurrentAssignments(machine);
        const newAssignments = [
          ...current,
          {
            itemId: mNewItemId,
            lotId: mNewLotId,
            sortOrder: current.length,
          },
        ];
        await putAssignments(machine.id, newAssignments);
        message.success("Đã thêm mặt hàng");
      }

      closeActionModal();
      await reloadMachines();
    } catch (e: unknown) {
      message.error(getErrorMessage(e, "Lỗi thao tác"));
    } finally {
      setActionSaving(false);
    }
  };

  // Xóa hẳn 1 dòng log isExtra (nhập nhầm)
  const handleDeleteExtraLog = async (row: ItemInput) => {
    if (!row.existingLogId) return;
    try {
      await deleteLog(row.existingLogId);
      message.success("Đã xóa dòng");
      await reloadMachines();
    } catch {
      message.error("Lỗi xóa dòng");
    }
  };

  // ============================
  // NAVIGATION
  // ============================
  const scrollBarTo = (idx: number) => {
    if (machineBarRef.current) {
      const btns = machineBarRef.current.querySelectorAll("button");
      btns[idx]?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  };

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < machines.length) {
      setCurrentIdx(idx);
      setTimeout(() => scrollBarTo(idx), 100);
    }
  };

  const goNext = () => {
    if (currentIdx < machines.length - 1) goTo(currentIdx + 1);
    else message.success("Đã nhập xong tất cả máy!");
  };

  // ============================
  // COMPUTED
  // ============================
  const machineSaved = useMemo(() => {
    const result: Record<number, boolean> = {};
    for (const m of machines) {
      const items = machineItems[m.id] || [];
      const hasDirty = items.some((it) => it.isDirty);
      const hasData = items.some(
        (it) => (it.outputKg ?? 0) > 0 || it.existingLogId,
      );
      result[m.id] = hasData && !hasDirty;
    }
    return result;
  }, [machines, machineItems]);

  const savedCount = useMemo(
    () => machines.filter((m) => machineSaved[m.id]).length,
    [machines, machineSaved],
  );

  const currentMachine = machines[currentIdx];
  const currentItems = currentMachine
    ? machineItems[currentMachine.id] || []
    : [];
  const currentTotalKg = currentItems.reduce(
    (s, it) => s + (it.outputKg || 0),
    0,
  );
  const hasDirty = currentItems.some((it) => it.isDirty);

  // Lots theo item
  const getLotsForItem = (itemId: number) =>
    allLots.filter((l) => !l.item || l.item.id === itemId);

  // ============================
  // AUTH GUARD
  // ============================
  if (status === "loading") {
    return (
      <div style={S.center}>
        <Spin size="large" tip="Đang tải..." />
      </div>
    );
  }
  if (status === "unauthenticated") {
    return (
      <div style={S.center}>
        <Result
          status="warning"
          title="Chưa đăng nhập"
          extra={
            <Button type="primary" size="large" href="/login">
              Đăng nhập
            </Button>
          }
        />
      </div>
    );
  }
  const isReadOnly = sessionUser?.accessLevel === "READ_ONLY";
  if (isReadOnly) {
    return (
      <div style={S.center}>
        <Result
          status="403"
          title="Không có quyền nhập liệu"
          extra={
            <Button size="large" href="/">
              Về trang chủ
            </Button>
          }
        />
      </div>
    );
  }

  // Modal đổi ngày/ca (dùng ở nhiều chỗ)
  const dateShiftModal = (
    <Modal
      open={dateShiftModalOpen}
      onCancel={() => setDateShiftModalOpen(false)}
      title="Ngày & Ca làm việc"
      centered
      footer={
        <Button
          type="primary"
          block
          size="large"
          onClick={handleConfirmDateShift}
          style={{ height: 48, fontSize: 16, fontWeight: 700 }}
        >
          Xác nhận
        </Button>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Button
          icon={<LeftOutlined />}
          size="large"
          onClick={() => setTempDate((p) => p.subtract(1, "day"))}
        />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 22, color: "#1677ff" }}>
            {tempDate.format("DD/MM/YYYY")}
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"][tempDate.day()]}
            {tempDate.isSame(dayjs(), "day") && (
              <span style={{ color: "#52c41a", marginLeft: 6 }}>• Hôm nay</span>
            )}
          </div>
        </div>
        <Button
          icon={<RightOutlined />}
          size="large"
          onClick={() => setTempDate((p) => p.add(1, "day"))}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3].map((s) => (
          <Button
            key={s}
            block
            size="large"
            type={tempShift === s ? "primary" : "default"}
            onClick={() => setTempShift(s)}
            style={{
              height: 52,
              fontSize: 17,
              fontWeight: tempShift === s ? 700 : 400,
            }}
          >
            Ca {s}
          </Button>
        ))}
      </div>
    </Modal>
  );

  // ============================
  // CHỌN CÔNG ĐOẠN
  // ============================
  if (!selectedProcessId) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <Button
            type="text"
            icon={<HomeOutlined />}
            style={{ color: "#fff", fontSize: 18 }}
            onClick={() => router.push("/")}
          />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              Nhập liệu đánh ống
            </div>
            <div
              onClick={() => setDateShiftModalOpen(true)}
              style={{
                fontSize: 13,
                opacity: 0.9,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {SHIFT_LABEL[selectedShift]} — {selectedDate.format("DD/MM/YYYY")}{" "}
              <span style={{ fontSize: 11, opacity: 0.7 }}>✏️</span>
            </div>
          </div>
          <div style={{ width: 32 }} />
        </div>
        {dateShiftModal}
        <div style={{ padding: 16 }}>
          <div
            style={{
              textAlign: "center",
              color: "#888",
              fontSize: 14,
              marginBottom: 20,
              fontWeight: 500,
            }}
          >
            Chọn công đoạn
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {processes.map((p) => (
              <Button
                key={p.id}
                size="large"
                block
                onClick={() => setSelectedProcessId(p.id)}
                style={{
                  height: 60,
                  fontSize: 18,
                  fontWeight: 600,
                  borderRadius: 12,
                  textAlign: "left",
                  paddingLeft: 20,
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================
  // LOADING
  // ============================
  if (loading) {
    return (
      <div style={S.center}>
        <Spin size="large" tip="Đang tải máy..." />
      </div>
    );
  }

  // ============================
  // KHÔNG CÓ MÁY ĐÁnh ỐNG
  // ============================
  if (machines.length === 0) {
    return (
      <div style={S.center}>
        <Result
          status="info"
          title="Không có máy đánh ống"
          subTitle="Công đoạn này không có máy chạy nhiều mặt hàng."
          extra={
            <Button
              size="large"
              onClick={() => {
                setSelectedProcessId(null);
                setMachines([]);
              }}
            >
              Chọn lại
            </Button>
          }
        />
      </div>
    );
  }

  // ============================
  // SUCCESS FLASH
  // ============================
  if (showSuccess) {
    return (
      <div
        style={{
          ...S.center,
          flexDirection: "column",
          background: "linear-gradient(135deg, #f6ffed, #e6fffb)",
        }}
      >
        <CheckCircleOutlined style={{ fontSize: 64, color: "#52c41a" }} />
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginTop: 16,
            color: "#389e0d",
          }}
        >
          Đã lưu: {lastSavedKg} kg
        </div>
        <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>
          Chuyển sang máy tiếp...
        </div>
      </div>
    );
  }

  // ============================
  // MAIN UI
  // ============================
  return (
    <div style={S.page}>
      {/* HEADER */}
      <div style={S.header}>
        <Button
          icon={<LeftOutlined />}
          size="small"
          onClick={() => {
            setSelectedProcessId(null);
            setMachines([]);
          }}
          style={{
            border: "none",
            background: "transparent",
            color: "#fff",
            fontSize: 16,
          }}
        />
        <div
          style={{ flex: 1, textAlign: "center", cursor: "pointer" }}
          onClick={() => {
            setTempDate(selectedDate);
            setTempShift(selectedShift);
            setDateShiftModalOpen(true);
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Nhập liệu đánh ống
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.9,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {SHIFT_LABEL[selectedShift]} — {selectedDate.format("DD/MM/YYYY")}{" "}
            <span style={{ fontSize: 10, opacity: 0.7 }}>✏️</span>
          </div>
        </div>
        <Button
          type="text"
          icon={<HomeOutlined />}
          style={{ color: "#fff", fontSize: 18 }}
          onClick={() => router.push("/")}
        />
      </div>

      {/* MACHINE BAR */}
      <div style={S.machineBar}>
        <div
          ref={machineBarRef}
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            padding: "8px 12px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {machines.map((m, idx) => {
            const isSaved = machineSaved[m.id];
            const isActive = idx === currentIdx;
            return (
              <Button
                key={m.id}
                size="small"
                onClick={() => goTo(idx)}
                style={{
                  minWidth: 56,
                  height: 36,
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  flexShrink: 0,
                  background: isActive
                    ? "#1677ff"
                    : isSaved
                      ? "#f6ffed"
                      : "#fff",
                  color: isActive ? "#fff" : isSaved ? "#389e0d" : "#333",
                  border: isActive
                    ? "2px solid #1677ff"
                    : isSaved
                      ? "2px solid #b7eb8f"
                      : "1px solid #d9d9d9",
                }}
              >
                {isSaved && !isActive && (
                  <CheckCircleOutlined style={{ marginRight: 2 }} />
                )}
                {m.name}
              </Button>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            marginBottom: 4,
            gap: 8,
          }}
        >
          <Progress
            percent={Math.round((savedCount / machines.length) * 100)}
            size="small"
            style={{ flex: 1 }}
            format={() => `${savedCount}/${machines.length}`}
          />
          <div
            style={{
              fontSize: 12,
              color: "#389e0d",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {currentTotalKg} kg
          </div>
        </div>
      </div>

      {/* TÊN MÁY */}
      <div style={S.machineInfo}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1677ff" }}>
          {currentMachine?.name}
        </div>
        {currentMachine && (
          <button
            type="button"
            onClick={openSourceModal}
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${
                currentMachine.currentSourceProcess ? "#91d5ff" : "#ffa39e"
              }`,
              background: currentMachine.currentSourceProcess ? "#e6f7ff" : "#fff1f0",
              color: currentMachine.currentSourceProcess ? "#0958d9" : "#cf1322",
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Nguon: {currentMachine.currentSourceProcess?.name || "Chua gan"}
            <DownOutlined style={{ fontSize: 10 }} />
          </button>
        )}
        {hasDirty && (
          <Tag color="orange" style={{ marginTop: 4, fontSize: 11 }}>
            Chưa lưu
          </Tag>
        )}
        {machineSaved[currentMachine?.id] && (
          <Tag color="green" style={{ marginTop: 4, fontSize: 11 }}>
            Đã lưu
          </Tag>
        )}
      </div>

      {/* DANH SÁCH ITEMS */}
      <div style={S.formArea}>
        {currentItems.map((it) => (
          <div
            key={it._uid}
            style={{
              ...S.itemCard,
              opacity: it.isExtra ? 0.75 : 1,
              borderColor: it.isExtra
                ? "#d9d9d9"
                : (it.outputKg ?? 0) > 0 || it.existingLogId
                  ? "#b7eb8f"
                  : "#e8e8e8",
              background: it.isExtra
                ? "#fafafa"
                : (it.outputKg ?? 0) > 0 || it.existingLogId
                  ? "#f6ffed"
                  : "#fff",
            }}
          >
            {/* Tên mặt hàng + lô + nút thao tác */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 10,
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <Tag
                  color="blue"
                  style={{
                    fontSize: 14,
                    padding: "3px 10px",
                    margin: 0,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.itemName || "(chưa chọn)"}
                </Tag>
                {it.lotNumber && (
                  <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>
                    Lô: {it.lotNumber}
                  </Tag>
                )}
                {it.isExtra && (
                  <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
                    Đã dừng giữa ca
                  </Tag>
                )}
              </div>

              {/* Nút thao tác */}
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                {!it.isExtra && it.itemId > 0 && (
                  <>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      title="Sửa sai (MH cũ chưa từng chạy)"
                      style={{ color: "#888", padding: "0 4px" }}
                      onClick={() => openActionModal("correction", it)}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<SwapOutlined />}
                      title="Đổi mặt hàng giữa ca"
                      style={{ color: "#1677ff", padding: "0 4px" }}
                      onClick={() => openActionModal("change", it)}
                    />
                  </>
                )}
                {it.isExtra && it.existingLogId && (
                  <Popconfirm
                    title="Xóa hẳn dòng này?"
                    description="Chỉ xóa nếu nhập nhầm."
                    onConfirm={() => handleDeleteExtraLog(it)}
                    okText="Xóa"
                    cancelText="Hủy"
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      style={{ padding: "0 4px" }}
                    />
                  </Popconfirm>
                )}
              </div>
            </div>

            {/* Sản lượng */}
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                Sản lượng (kg)
              </div>
              <InputNumber
                style={{
                  width: "100%",
                  height: 56,
                  fontSize: 24,
                  fontWeight: 700,
                  borderRadius: 10,
                }}
                controls={false}
                min={0}
                inputMode="decimal"
                placeholder="Nhập kg..."
                value={it.outputKg}
                onChange={(v) =>
                  updateItem(currentMachine.id, it._uid, { outputKg: v })
                }
                addonAfter="kg"
              />
            </div>
          </div>
        ))}

        {/* THÊM MẶT HÀNG SONG SONG */}
        <Button
          block
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => openActionModal("add", null)}
          style={{
            height: 48,
            fontSize: 15,
            borderRadius: 12,
            margin: "4px 16px",
            width: "calc(100% - 32px)",
          }}
        >
          + Thêm mặt hàng mới
        </Button>

        {/* TỔNG KG */}
        <div
          style={{
            margin: "12px 16px",
            padding: "12px 16px",
            borderRadius: 12,
            background: "#f0f5ff",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 13, color: "#888" }}>Tổng sản lượng</div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#1677ff",
              lineHeight: 1.2,
            }}
          >
            {currentTotalKg}{" "}
            <span style={{ fontSize: 16, fontWeight: 500 }}>kg</span>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={S.actionBar}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Button
            icon={<LeftOutlined />}
            disabled={currentIdx === 0}
            onClick={() => goTo(currentIdx - 1)}
            style={{ ...S.navBtn, flex: 1 }}
          >
            Trước
          </Button>
          <Button
            disabled={currentIdx >= machines.length - 1}
            onClick={() => goTo(currentIdx + 1)}
            style={{ ...S.navBtn, flex: 1 }}
          >
            Sau <RightOutlined />
          </Button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="large"
            icon={<SaveOutlined />}
            onClick={() => handleSave(false)}
            loading={saving}
            style={{
              ...S.saveBtn,
              flex: 1,
              background: "#fff",
              color: "#1677ff",
              border: "2px solid #1677ff",
            }}
          >
            Lưu
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={() => handleSave(true)}
            loading={saving}
            style={{ ...S.saveBtn, flex: 2 }}
          >
            Lưu & Tiếp →
          </Button>
        </div>
      </div>

      {dateShiftModal}
      <Modal
        open={sourceModalOpen}
        onCancel={() => setSourceModalOpen(false)}
        title="Doi nguon soi"
        centered
        footer={[
          <Button key="cancel" onClick={() => setSourceModalOpen(false)} size="large">
            Huy
          </Button>,
          <Button
            key="ok"
            type="primary"
            size="large"
            loading={sourceSaving}
            onClick={handleChangeSource}
          >
            Xac nhan
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: "#666" }}>
          May: <strong>{currentMachine?.name}</strong>
        </div>
        <Select
          size="large"
          style={{ width: "100%" }}
          placeholder="Chon nguon soi..."
          showSearch
          optionFilterProp="label"
          value={pendingSourceId}
          onChange={(v: number) => setPendingSourceId(v)}
          options={sourceOptions.map((p) => ({
            label: `${p.name} -> ${p.revenueFactory?.name || "?"}`,
            value: p.id,
          }))}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>
          Log moi tao sau khi doi se snapshot nguon soi nay. Log da luu truoc do
          khong bi ghi de.
        </div>
      </Modal>
      {actionModal.open && renderActionModal()}
    </div>
  );

  // ============================
  // RENDER MODAL THAO TÁC GIỮA CA
  // ============================
  function renderActionModal() {
    const { mode, row } = actionModal;
    const title =
      mode === "correction"
        ? "✏️ Sửa sai mặt hàng"
        : mode === "change"
          ? "🔄 Đổi mặt hàng giữa ca"
          : "➕ Thêm mặt hàng song song";

    const showNewItem =
      mode === "correction" || mode === "add" || mChangeMode === "switch";
    const lotOptions = mNewItemId ? getLotsForItem(mNewItemId) : [];

    return (
      <Modal
        open={actionModal.open}
        onCancel={closeActionModal}
        title={title}
        centered
        footer={[
          <Button key="cancel" onClick={closeActionModal} size="large">
            Hủy
          </Button>,
          <Button
            key="ok"
            type="primary"
            size="large"
            loading={actionSaving}
            onClick={submitActionModal}
          >
            Xác nhận
          </Button>,
        ]}
      >
        {/* MH đang thao tác */}
        {row && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ color: "#888", fontSize: 13 }}>
              Mặt hàng hiện tại:{" "}
            </span>
            <Tag color="blue">{row.itemName}</Tag>
            {row.lotNumber && <Tag color="orange">Lô: {row.lotNumber}</Tag>}
          </div>
        )}

        {/* ĐỔI GIỮA CA: nhập sản lượng MH cũ + chọn chế độ */}
        {mode === "change" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
                Sản lượng đã chạy của MH cũ (kg){" "}
                <span style={{ color: "#ff4d4f" }}>*</span>
              </div>
              <InputNumber
                style={{ width: "100%", height: 48, fontSize: 18 }}
                min={0}
                controls={false}
                inputMode="decimal"
                placeholder="Nhập kg đã chạy..."
                value={mOldOutputKg}
                onChange={(v) => setMOldOutputKg(v)}
                addonAfter="kg"
              />
            </div>
            <Radio.Group
              value={mChangeMode}
              onChange={(e) => setMChangeMode(e.target.value)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Radio value="switch">Đổi sang mặt hàng khác</Radio>
              <Radio value="stop">Dừng hẳn (không chạy MH này nữa)</Radio>
            </Radio.Group>
          </>
        )}

        {/* CHỌN MH MỚI + LÔ + CỌC */}
        {showNewItem && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
                Mặt hàng {mode === "change" ? "mới" : ""}{" "}
                <span style={{ color: "#ff4d4f" }}>*</span>
              </div>
              <Select
                style={{ width: "100%" }}
                placeholder="Chọn mặt hàng..."
                showSearch
                optionFilterProp="children"
                size="large"
                value={mNewItemId ?? undefined}
                onChange={(v: number) => {
                  setMNewItemId(v);
                  setMNewLotId(null); // reset lô khi đổi item
                }}
              >
                {allItems.map((i) => (
                  <Select.Option key={i.id} value={i.id}>
                    {i.name}
                  </Select.Option>
                ))}
              </Select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
                Lô{" "}
                <span style={{ fontSize: 11, color: "#bbb" }}>
                  (bắt buộc nếu trùng MH với dòng khác)
                </span>
              </div>
              <Select
                style={{ width: "100%" }}
                placeholder="Chọn lô..."
                allowClear
                showSearch
                optionFilterProp="children"
                size="large"
                value={mNewLotId ?? undefined}
                onChange={(v: number | undefined) => setMNewLotId(v ?? null)}
              >
                {lotOptions.map((l) => (
                  <Select.Option key={l.id} value={l.id}>
                    {l.lotNumber}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </>
        )}
      </Modal>
    );
  }
}

// ============================
// STYLES
// ============================
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#f0f2f5",
    maxWidth: 480,
    margin: "0 auto",
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    background: "#f0f2f5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "12px 8px",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff",
  },
  machineBar: { background: "#fff", borderBottom: "1px solid #e8e8e8" },
  machineInfo: {
    textAlign: "center",
    padding: "14px 12px 10px",
    background: "#fff",
  },
  formArea: { flex: 1, paddingTop: 12, overflowY: "auto" },
  itemCard: {
    margin: "0 16px 12px",
    padding: 14,
    borderRadius: 12,
    border: "1.5px solid",
    background: "#fff",
  },
  actionBar: {
    padding: "12px 16px 24px",
    background: "#fff",
    borderTop: "1px solid #e8e8e8",
  },
  navBtn: { height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500 },
  saveBtn: { height: 56, borderRadius: 12, fontSize: 18, fontWeight: 700 },
};

// ============================
// EXPORT
// ============================
export default function MobileWindingPage() {
  return (
    <Suspense
      fallback={
        <div style={S.center}>
          <Spin size="large" />
        </div>
      }
    >
      <MobileWindingContent />
    </Suspense>
  );
}
