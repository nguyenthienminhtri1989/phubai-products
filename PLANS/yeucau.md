**File: `src/app/production/daily-input-grid/page.tsx`**

Đọc thêm file `src/app/api/machines/[id]/assignments/route.ts` để biết API assignments.

**Cần sửa:**

### 1. Thêm interface + state

```typescript
// Thêm vào interface MachineStatus:
allowMultiItemPerShift?: boolean;

// Thêm state:
const [machineAssignments, setMachineAssignments] = useState<Record<number, any[]>>({});
```

### 2. Trong `handleLoad` — sau khi fetch machines, fetch assignments cho máy multi-item

```typescript
// Sau dòng: const machines: MachineStatus[] = await statusRes.json();
// Fetch assignments cho máy multi-item
const assignmentMap: Record<number, any[]> = {};
for (const m of machines) {
  if ((m as any).allowMultiItemPerShift) {
    try {
      const aRes = await fetch(`/api/machines/${m.id}/assignments`);
      if (aRes.ok) assignmentMap[m.id] = await aRes.json();
    } catch {}
  }
}
setMachineAssignments(assignmentMap);
```

### 3. Trong phần build rows — xử lý máy multi-item

```typescript
machines.forEach((m) => {
  const logs: ProductionLogEntry[] =
    m.todayLogs ?? (m.todayLog ? [m.todayLog] : []);
  const assignments = assignmentMap[m.id];

  // Máy multi-item: tạo 1 row per assignment
  if (
    (m as any).allowMultiItemPerShift &&
    assignments &&
    assignments.length > 0
  ) {
    for (const a of assignments) {
      // Tìm log đã có cho assignment này
      const existingLog = logs.find((l) => l.itemId === a.itemId);
      newRows.push({
        machineId: m.id,
        machineName: m.name,
        formulaType: 1, // nhập kg trực tiếp cho máy ống
        spindleCount: m.spindleCount || 1,
        itemId: a.item.id,
        itemName: `${a.item.name}${a.fromSpindle ? ` (cọc ${a.fromSpindle}-${a.toSpindle})` : ""}`,
        originalItemId: a.item.id,
        startIndex: 0,
        endIndex: existingLog?.endIndex ?? null,
        inputNE: 0,
        isStopped: existingLog?.note === "Máy dừng",
        efficiency: existingLog?.efficiency ?? null,
        note: existingLog?.note ?? "",
        isDirty: false,
        existingLogId: existingLog?.id,
        rowKey: genKey(),
        isSubRow: assignments.indexOf(a) > 0,
      });
    }
    return; // skip logic thường
  }

  // Logic hiện tại cho máy thường (giữ nguyên)
  // ...
});
```

### 4. Trong `handleSave` — máy multi-item gửi itemId từ assignment

Không cần sửa gì đặc biệt vì mỗi row đã có `itemId` đúng từ assignment. Logic save hiện tại gửi `r.itemId` → đúng.

### 5. Ẩn nút "+" (thêm sub-row đổi MH) cho máy multi-item

Trong cột cuối (nút +), thêm điều kiện:

```typescript
// Chỉ hiện nút + cho máy thường, không hiện cho multi-item
if (!r.isSubRow && !machineAssignments[r.machineId]) {
  // hiện nút + như hiện tại
}
```

### 6. API daily-status cần trả thêm `allowMultiItemPerShift`

File: `src/app/api/production/daily-status/route.ts`

Trong query machines, thêm `allowMultiItemPerShift: true` vào select.

---

Tóm tắt: trang grid desktop cần cùng logic với mobile — máy multi-item fetch assignments → tạo N rows thay vì 1. Sửa 2 files: `daily-input-grid/page.tsx` + `daily-status/route.ts`.
