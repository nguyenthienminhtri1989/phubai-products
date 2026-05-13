# SPEC: Trang Daily Input (Mobile) — Hỗ trợ máy multi-item + Ghi ngược mặt hàng

## Mục tiêu

Trang `/production/daily-input` (giao diện mobile, nhập từng máy qua modal) hiện chỉ hiện 1 ô nhập cho mọi máy. Cần sửa để:

1. **Máy multi-item** (`allowMultiItemPerShift = true`): modal hiện N ô nhập, mỗi ô 1 mặt hàng theo assignments
2. **Ghi ngược mặt hàng cho máy multi-item**: cập nhật vào `machine_item_assignments` thay vì `machines.currentItemId`
3. **Ghi ngược lô hàng**: đã có sẵn, giữ nguyên

---

## Đọc các file sau trước khi code

```
src/app/production/daily-input/page.tsx            → file chính cần sửa
src/app/api/machines/[id]/assignments/route.ts     → API GET/PUT/PATCH assignments
src/app/api/machines/batch/route.ts                → API batch update currentItemId (máy thường)
src/app/api/production/daily-input/route.ts        → API lưu ProductionLog
src/app/api/production/daily-status/route.ts       → API lấy danh sách máy + log
prisma/schema.prisma                               → model Machine, MachineItemAssignment
```

---

## 1. Backend — Thêm PATCH vào assignments API

### File: `src/app/api/machines/[id]/assignments/route.ts`

Thêm hàm `PATCH` — cập nhật 1 assignment duy nhất (đổi itemId cũ → mới):

```typescript
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id);
  if (isNaN(machineId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const body = await req.json();
    const { oldItemId, newItemId } = body;

    if (!oldItemId || !newItemId) {
      return NextResponse.json(
        { error: "Thiếu oldItemId hoặc newItemId" },
        { status: 400 },
      );
    }

    // Tìm assignment hiện tại
    const existing = await prisma.machineItemAssignment.findUnique({
      where: { machineId_itemId: { machineId, itemId: oldItemId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy assignment" },
        { status: 404 },
      );
    }

    // Check conflict
    const conflict = await prisma.machineItemAssignment.findUnique({
      where: { machineId_itemId: { machineId, itemId: newItemId } },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Mặt hàng mới đã được gán cho máy này rồi" },
        { status: 400 },
      );
    }

    const updated = await prisma.machineItemAssignment.update({
      where: { id: existing.id },
      data: { itemId: newItemId },
      include: { item: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("Assignment PATCH error:", e);
    return NextResponse.json(
      { error: e.message || "Lỗi cập nhật" },
      { status: 500 },
    );
  }
}
```

---

## 2. Frontend — Sửa `src/app/production/daily-input/page.tsx`

### 2.1 Thêm interface & state

```typescript
// Thêm interface
interface MachineAssignment {
  id: number;
  machineId: number;
  itemId: number;
  item: { id: number; name: string };
}

// Thêm vào Machine interface
interface Machine {
  // ... các field hiện tại ...
  allowMultiItemPerShift?: boolean;
  todayLogs?: Array<{
    id: number;
    itemId: number;
    item?: { id: number; name: string };
    finalOutput: number;
    startIndex?: number;
    endIndex?: number;
    inputNE?: number;
    efficiency?: number | null;
    note?: string;
  }>;
}

// Thêm state mới trong component
const [machineAssignments, setMachineAssignments] = useState<
  Record<number, MachineAssignment[]>
>({});

// State cho modal multi-item: lưu giá trị nhập cho từng mặt hàng
// Key = itemId, value = { endIndex, isStopped, efficiency, note, existingLogId?, originalItemId }
interface MultiItemInput {
  itemId: number;
  itemName: string;
  endIndex: number | null;
  isStopped: boolean;
  efficiency: number | null;
  note: string;
  existingLogId?: number;
  originalItemId: number; // để detect thay đổi mặt hàng
}
const [multiItemInputs, setMultiItemInputs] = useState<MultiItemInput[]>([]);
```

### 2.2 Fetch assignments khi load máy

Trong `fetchMachines()`, sau khi load danh sách máy, fetch assignments cho máy multi-item:

```typescript
const fetchMachines = async () => {
  if (!selectedProcessId) return;
  setLoading(true);
  try {
    const dateStr = selectedDate.format("YYYY-MM-DD");
    const query = `?processId=${selectedProcessId}&date=${dateStr}&shift=${selectedShift}`;
    const [res, resTotal] = await Promise.all([
      fetch(`/api/production/daily-status${query}`),
      fetch(
        `/api/production/daily-total?processId=${selectedProcessId}&date=${dateStr}`,
      ),
    ]);
    const machineList: Machine[] = await res.json();
    setMachines(machineList);

    // Fetch assignments cho máy multi-item
    const assignMap: Record<number, MachineAssignment[]> = {};
    for (const m of machineList) {
      if (m.allowMultiItemPerShift) {
        try {
          const aRes = await fetch(`/api/machines/${m.id}/assignments`);
          if (aRes.ok) assignMap[m.id] = await aRes.json();
        } catch {}
      }
    }
    setMachineAssignments(assignMap);

    if (resTotal.ok) {
      const data = await resTotal.json();
      setTotalOutput3Ca(data.total || 0);
    }
  } catch {
    message.error("Lỗi tải máy");
  } finally {
    setLoading(false);
  }
};
```

### 2.3 Hiển thị card máy multi-item

Trong phần render card (dòng ~656-693), với máy multi-item nên hiển thị gợi ý số mặt hàng:

```tsx
{machines.map(m => {
  const isDone = !!m.todayLog;
  const assignments = machineAssignments[m.id];
  const isMulti = m.allowMultiItemPerShift && assignments && assignments.length > 0;

  return (
    <Col key={m.id} xs={12} sm={8} md={6} lg={4}>
      <Card ...>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>{m.name}</b>
          {isDone && <SaveOutlined style={{ color: '#52c41a' }} />}
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 3, ... }}>
          {isMulti
            ? assignments.map(a => a.item.name).join(' + ')
            : (m.todayLog?.item?.name ?? m.currentItem?.name) || <span style={{ color: 'red' }}>Chưa gán hàng</span>
          }
        </div>
        {/* ... phần lô và sản lượng giữ nguyên ... */}
      </Card>
    </Col>
  );
})}
```

### 2.4 Mở modal — phân nhánh theo loại máy

Sửa `handleOpenMachine`:

```typescript
const handleOpenMachine = async (machine: Machine) => {
  setCurrentMachine(machine);
  form.resetFields();
  setIsItemChangeVisible(false);
  setCutoverIndex(null);
  setNewItemId(null);

  const assignments = machineAssignments[machine.id];
  const isMulti =
    machine.allowMultiItemPerShift && assignments && assignments.length > 0;

  if (isMulti) {
    // === MÁY MULTI-ITEM ===
    // Build multiItemInputs từ assignments + existing logs
    const logs =
      machine.todayLogs ?? (machine.todayLog ? [machine.todayLog] : []);
    const inputs: MultiItemInput[] = assignments.map((a) => {
      const existingLog = logs.find((l) => l.itemId === a.itemId);
      return {
        itemId: a.itemId,
        itemName: a.item.name,
        endIndex: existingLog?.endIndex ?? null,
        isStopped: existingLog?.note === "Máy dừng",
        efficiency: existingLog?.efficiency ?? null,
        note: existingLog?.note === "Máy dừng" ? "" : (existingLog?.note ?? ""),
        existingLogId: existingLog?.id,
        originalItemId: a.itemId,
      };
    });
    setMultiItemInputs(inputs);

    // Khởi tạo lô (giống máy thường)
    setQuickAssignLotNumber(machine.currentLot?.lotNumber ?? "");
    setShowQuickAssignLot(false);
    setShowQuickAssign(false);

    setIsModalOpen(true);
    return; // Không cần fetch last-log, không dùng form cho multi-item
  }

  // === MÁY THƯỜNG — giữ nguyên logic hiện tại ===
  setMultiItemInputs([]); // clear
  setQuickAssignItemId(machine.currentItem?.id ?? null);
  setShowQuickAssign(!machine.currentItem);
  setQuickAssignLotNumber(machine.currentLot?.lotNumber ?? "");
  setShowQuickAssignLot(false);

  // ... phần còn lại giữ nguyên (initValues, fetch last-log, v.v.) ...
};
```

### 2.5 Modal render — phân nhánh theo loại máy

Trong Modal body, thêm nhánh render cho multi-item **trước** form hiện tại:

```tsx
<Modal
  open={isModalOpen}
  onCancel={() => {
    /* reset tất cả state */
  }}
  footer={null}
  width={isMobile ? "96vw" : 500}
  title={
    <span>
      {currentMachine?.name}
      {multiItemInputs.length > 0 ? (
        <Tag color="purple" style={{ marginLeft: 8 }}>
          Nhiều mặt hàng
        </Tag>
      ) : (
        <Tag color="blue" style={{ marginLeft: 8 }}>
          {currentMachine?.todayLog?.item?.name ??
            currentMachine?.currentItem?.name}
        </Tag>
      )}
    </span>
  }
>
  {multiItemInputs.length > 0 ? (
    // ====== GIAO DIỆN MÁY MULTI-ITEM ======
    <div>
      {/* Lô hàng — giống máy thường, giữ nguyên UI hiện tại */}
      {/* ... copy phần showQuickAssignLot ... */}

      {/* N ô nhập, mỗi ô 1 mặt hàng */}
      {multiItemInputs.map((input, idx) => (
        <div
          key={input.originalItemId}
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: input.isStopped
              ? "#fffbe6"
              : input.endIndex !== null
                ? "#f6ffed"
                : "#fafafa",
            border: `1px solid ${input.isStopped ? "#faad14" : input.endIndex !== null ? "#b7eb8f" : "#e8e8e8"}`,
          }}
        >
          {/* Header: tên mặt hàng + nút đổi + switch dừng */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
                {input.itemName}
              </Tag>
              {!isReadOnly && (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, color: "#d46b08", fontSize: 11 }}
                  onClick={() => {
                    // Mở Select đổi mặt hàng cho dòng này
                    // Dùng state editingMultiItemIdx để track
                    setEditingMultiItemIdx(idx);
                  }}
                >
                  ✏️ Đổi
                </Button>
              )}
            </div>
            <Switch
              size="small"
              checkedChildren="Dừng"
              unCheckedChildren="Chạy"
              checked={input.isStopped}
              onChange={(val) => {
                setMultiItemInputs((prev) =>
                  prev.map((inp, i) =>
                    i === idx ? { ...inp, isStopped: val } : inp,
                  ),
                );
              }}
            />
          </div>

          {/* Select đổi mặt hàng (chỉ hiện khi đang edit) */}
          {editingMultiItemIdx === idx && (
            <div style={{ marginBottom: 10 }}>
              <Select
                autoFocus
                showSearch
                optionFilterProp="label"
                style={{ width: "100%" }}
                value={input.itemId}
                options={items.map((i) => ({ label: i.name, value: i.id }))}
                onChange={(val) => {
                  const item = items.find((i) => i.id === val);
                  if (!item) return;
                  setMultiItemInputs((prev) =>
                    prev.map((inp, i) =>
                      i === idx
                        ? { ...inp, itemId: val, itemName: item.name }
                        : inp,
                    ),
                  );
                  setEditingMultiItemIdx(null);
                }}
                onBlur={() => setEditingMultiItemIdx(null)}
              />
            </div>
          )}

          {/* Ô nhập sản lượng (kg) — formulaType = 1 cho máy multi-item */}
          {!input.isStopped && (
            <InputNumber
              placeholder="Sản lượng (kg)"
              value={input.endIndex}
              onChange={(val) => {
                setMultiItemInputs((prev) =>
                  prev.map((inp, i) =>
                    i === idx ? { ...inp, endIndex: val } : inp,
                  ),
                );
              }}
              style={{
                width: "100%",
                height: isMobile ? 56 : 44,
                fontSize: isMobile ? 24 : 18,
                fontWeight: 700,
              }}
              controls={false}
              inputMode="decimal"
            />
          )}

          {/* Hiệu suất + Ghi chú (compact) */}
          {!input.isStopped && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <InputNumber
                placeholder="HS %"
                value={input.efficiency}
                min={0}
                max={200}
                controls={false}
                style={{ width: 80 }}
                onChange={(val) => {
                  setMultiItemInputs((prev) =>
                    prev.map((inp, i) =>
                      i === idx ? { ...inp, efficiency: val } : inp,
                    ),
                  );
                }}
              />
              <Input
                placeholder="Ghi chú..."
                value={input.note}
                style={{ flex: 1 }}
                onChange={(e) => {
                  setMultiItemInputs((prev) =>
                    prev.map((inp, i) =>
                      i === idx ? { ...inp, note: e.target.value } : inp,
                    ),
                  );
                }}
              />
            </div>
          )}

          {/* Trạng thái đã nhập */}
          {input.existingLogId && (
            <div style={{ fontSize: 11, color: "#52c41a", marginTop: 6 }}>
              ✓ Đã lưu trước đó
            </div>
          )}
        </div>
      ))}

      {/* Tổng sản lượng multi-item */}
      <div
        style={{
          textAlign: "center",
          padding: "14px 12px",
          background: "#f6ffed",
          marginBottom: 14,
          borderRadius: 10,
          border: "1px solid #b7eb8f",
        }}
      >
        <div style={{ color: "#888", fontSize: 12 }}>Tổng sản lượng</div>
        <div
          style={{
            fontSize: isMobile ? 38 : 28,
            fontWeight: "bold",
            color: "#389e0d",
            lineHeight: 1.2,
          }}
        >
          {multiItemInputs.reduce(
            (sum, inp) => sum + (inp.isStopped ? 0 : (inp.endIndex ?? 0)),
            0,
          )}
          <small style={{ fontSize: "45%", fontWeight: "normal" }}> kg</small>
        </div>
      </div>

      {/* Nút Lưu */}
      <Row gutter={8}>
        <Col span={8}>
          <Button
            block
            style={{ height: isMobile ? 48 : undefined }}
            onClick={() => setIsModalOpen(false)}
          >
            Hủy
          </Button>
        </Col>
        <Col span={8}>
          <Button
            block
            icon={<SaveOutlined />}
            style={{ height: isMobile ? 48 : undefined }}
            onClick={() => handleSaveMultiItem(false)}
          >
            Lưu
          </Button>
        </Col>
        <Col span={8}>
          <Button
            block
            type="primary"
            icon={<ArrowRightOutlined />}
            style={{ height: isMobile ? 48 : undefined }}
            onClick={() => handleSaveMultiItem(true)}
          >
            Lưu & Tiếp
          </Button>
        </Col>
      </Row>
    </div>
  ) : (
    // ====== GIAO DIỆN MÁY THƯỜNG — giữ nguyên toàn bộ Form hiện tại ======
    <Form form={form} layout="vertical">
      {/* ... code hiện tại không đổi ... */}
    </Form>
  )}
</Modal>
```

### 2.6 Thêm state cho editing multi-item

```typescript
const [editingMultiItemIdx, setEditingMultiItemIdx] = useState<number | null>(
  null,
);
```

### 2.7 Hàm `handleSaveMultiItem` — lưu + ghi ngược

```typescript
const handleSaveMultiItem = async (saveAndNext: boolean) => {
  if (!currentMachine) return;
  try {
    const dateStr = selectedDate.format("YYYY-MM-DD");

    // 1. Ghi ngược mặt hàng nếu thay đổi (PATCH assignment)
    for (const inp of multiItemInputs) {
      if (inp.itemId !== inp.originalItemId) {
        const res = await fetch(
          `/api/machines/${currentMachine.id}/assignments`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldItemId: inp.originalItemId,
              newItemId: inp.itemId,
            }),
          },
        );
        if (!res.ok) {
          const data = await res.json();
          message.error(`Lỗi cập nhật assignment: ${data.error ?? ""}`);
          return; // Dừng lại, không lưu sản lượng
        }
      }
    }

    // 2. Ghi ngược lô hàng (logic giống máy thường — copy từ submitData)
    const prevLotNumber = currentMachine.currentLot?.lotNumber ?? "";
    const newLotNumber = quickAssignLotNumber.trim();
    if (newLotNumber !== prevLotNumber) {
      let newLotId: number | null = null;
      if (newLotNumber) {
        const lotRes = await fetch(
          `/api/lots?search=${encodeURIComponent(newLotNumber)}`,
        );
        if (lotRes.ok) {
          const lotList: { id: number; lotNumber: string }[] =
            await lotRes.json();
          const found = lotList.find((l) => l.lotNumber === newLotNumber);
          if (found) newLotId = found.id;
          else message.warning(`Không tìm thấy lô "${newLotNumber}"`);
        }
      }
      if (newLotId !== null || newLotNumber === "") {
        await fetch(`/api/machines/${currentMachine.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: currentMachine.name,
            processId: currentMachine.processId,
            formulaType: currentMachine.formulaType,
            spindleCount: currentMachine.spindleCount,
            isActive: true,
            currentLotId: newLotId,
          }),
        });
        const updatedLot = newLotId
          ? { id: newLotId, lotNumber: newLotNumber }
          : null;
        setCurrentMachine((prev) =>
          prev ? { ...prev, currentLot: updatedLot } : prev,
        );
        setMachines((prev) =>
          prev.map((m) =>
            m.id === currentMachine.id ? { ...m, currentLot: updatedLot } : m,
          ),
        );
      }
    }

    // 3. Lưu production logs — 1 log per mặt hàng
    let savedCount = 0;
    for (const inp of multiItemInputs) {
      const kg = inp.isStopped ? 0 : (inp.endIndex ?? 0);
      if (kg <= 0 && !inp.isStopped) continue; // Bỏ qua dòng chưa nhập

      const res = await fetch("/api/production/daily-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordDate: dateStr,
          shift: selectedShift,
          machineId: currentMachine.id,
          itemId: inp.itemId,
          startIndex: 0,
          endIndex: inp.isStopped ? null : inp.endIndex,
          inputNE: 0,
          finalOutput: kg,
          efficiency: inp.efficiency,
          note: inp.isStopped ? "Máy dừng" : inp.note || "",
        }),
      });
      if (!res.ok) {
        message.error(`Lỗi lưu ${inp.itemName}`);
      } else {
        savedCount++;
      }
    }

    if (savedCount > 0) message.success(`Đã lưu ${savedCount} mặt hàng`);

    // 4. Cập nhật local state
    const totalKg = multiItemInputs.reduce(
      (s, inp) => s + (inp.isStopped ? 0 : (inp.endIndex ?? 0)),
      0,
    );
    setMachines((prev) =>
      prev.map((m) =>
        m.id === currentMachine.id
          ? {
              ...m,
              todayLog: {
                id: 0,
                itemId: multiItemInputs[0]?.itemId ?? 0,
                finalOutput: totalKg,
              },
            }
          : m,
      ),
    );

    // 5. Cập nhật assignments local nếu có thay đổi mặt hàng
    const hasItemChange = multiItemInputs.some(
      (inp) => inp.itemId !== inp.originalItemId,
    );
    if (hasItemChange) {
      // Re-fetch assignments
      try {
        const aRes = await fetch(
          `/api/machines/${currentMachine.id}/assignments`,
        );
        if (aRes.ok) {
          const newAssignments = await aRes.json();
          setMachineAssignments((prev) => ({
            ...prev,
            [currentMachine.id]: newAssignments,
          }));
        }
      } catch {}
    }

    // 6. Navigate
    if (saveAndNext) {
      const idx = machines.findIndex((m) => m.id === currentMachine.id);
      if (idx < machines.length - 1) handleOpenMachine(machines[idx + 1]);
      else {
        setIsModalOpen(false);
        message.success("Đã nhập hết danh sách!");
      }
    } else {
      setIsModalOpen(false);
    }
  } catch (e: any) {
    message.error(e.message || "Lỗi khi lưu");
  }
};
```

---

## 3. Lưu ý quan trọng khi implement

### 3.1 API daily-status cần trả thêm field

File `src/app/api/production/daily-status/route.ts` cần trả thêm:

- `allowMultiItemPerShift` — kiểm tra xem đã include trong select chưa
- `todayLogs` (mảng tất cả log của máy trong ca đó) — để máy multi-item biết log nào đã tồn tại

**Kiểm tra**: đọc file API daily-status, nếu chưa có thì thêm:

```typescript
// Trong select machine:
allowMultiItemPerShift: true,

// Thay vì chỉ trả todayLog (1 log đầu tiên), trả todayLogs (tất cả):
// Với máy multi-item, có thể có nhiều log cùng ca cùng máy (khác itemId)
```

### 3.2 Không ẩn phần "Đổi hàng giữa ca" ở máy thường

Giữ nguyên logic đổi hàng giữa ca cho máy thường. Máy multi-item không cần feature này (đã có nhiều ô sẵn).

### 3.3 Reset state khi đóng modal

Trong `onCancel` của Modal, thêm:

```typescript
setMultiItemInputs([]);
setEditingMultiItemIdx(null);
```

---

## 4. Tóm tắt thay đổi

| File                                             | Thay đổi                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/app/api/machines/[id]/assignments/route.ts` | Thêm `PATCH` handler                                                               |
| `src/app/api/production/daily-status/route.ts`   | Đảm bảo trả `allowMultiItemPerShift` + `todayLogs`                                 |
| `src/app/production/daily-input/page.tsx`        | Thêm state: `machineAssignments`, `multiItemInputs`, `editingMultiItemIdx`         |
| `src/app/production/daily-input/page.tsx`        | Sửa `fetchMachines`: fetch assignments cho máy multi-item                          |
| `src/app/production/daily-input/page.tsx`        | Sửa `handleOpenMachine`: phân nhánh multi-item vs thường                           |
| `src/app/production/daily-input/page.tsx`        | Sửa Modal render: 2 nhánh UI                                                       |
| `src/app/production/daily-input/page.tsx`        | Thêm `handleSaveMultiItem`: lưu N logs + ghi ngược mặt hàng (PATCH) + ghi ngược lô |
| `src/app/production/daily-input/page.tsx`        | Sửa card hiển thị: show nhiều tên mặt hàng cho máy multi-item                      |

---

## 5. Verify

```bash
# 1. PATCH endpoint
grep -n "PATCH\|oldItemId\|newItemId" src/app/api/machines/\[id\]/assignments/route.ts

# 2. Multi-item state
grep -n "multiItemInputs\|machineAssignments\|editingMultiItemIdx" src/app/production/daily-input/page.tsx

# 3. handleSaveMultiItem
grep -n "handleSaveMultiItem\|PATCH.*assignments" src/app/production/daily-input/page.tsx

# 4. daily-status trả đủ field
grep -n "allowMultiItemPerShift\|todayLogs" src/app/api/production/daily-status/route.ts

# 5. Modal phân nhánh
grep -n "multiItemInputs.length" src/app/production/daily-input/page.tsx
```

---

## 6. Test thủ công

1. **Máy thường**: mở modal → hiện 1 ô nhập như cũ → đổi mặt hàng → lưu → check `/machines` đã cập nhật ✓
2. **Máy multi-item (2 mặt hàng)**: mở modal → hiện 2 ô nhập riêng biệt → nhập sản lượng cho cả 2 → lưu → check 2 ProductionLog được tạo ✓
3. **Máy multi-item đổi mặt hàng**: đổi 1 trong 2 mặt hàng → lưu → check assignment đã cập nhật trong `/machines` ✓
4. **Máy multi-item có log cũ**: đã nhập trước đó → mở lại → giá trị được điền sẵn từ todayLogs ✓
5. **Lô hàng**: đổi lô → lưu → check `machines.currentLotId` đã cập nhật ✓
6. **Lưu & Tiếp**: nhập xong máy multi-item → tự chuyển sang máy tiếp theo ✓
