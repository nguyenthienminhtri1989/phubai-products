**FIX bước 4: Sửa đúng trang mobile input — file `src/app/production/mobile-input/page.tsx`**

Đọc file `src/app/production/mobile-input/page.tsx` và `src/app/api/machines/[id]/assignments/route.ts` trước khi code.

Các bước 1-3 (schema, API assignments, UI machines) đã xong. Chỉ cần sửa bước 4 trong file `src/app/production/mobile-input/page.tsx`:

### 4.1 Thêm state:

```typescript
const [machineAssignments, setMachineAssignments] = useState<
  Record<number, any[]>
>({});
const [multiInputStates, setMultiInputStates] = useState<
  Record<number, Record<number, number | null>>
>({});
```

### 4.2 Khi load máy (trong useEffect fetchMachines), sau khi có danh sách máy:

```typescript
// Với mỗi máy có allowMultiItemPerShift = true, fetch assignments
for (const m of filtered) {
  if (m.allowMultiItemPerShift) {
    const res = await fetch(`/api/machines/${m.id}/assignments`);
    if (res.ok) {
      const data = await res.json();
      machineAssignments[m.id] = data;
    }
  }
}
setMachineAssignments({ ...machineAssignments });
```

Cần thêm `allowMultiItemPerShift` vào interface Machine:

```typescript
interface Machine {
  // ... fields hiện có ...
  allowMultiItemPerShift?: boolean;
}
```

### 4.3 Render UI: phân biệt 2 loại máy

**Máy thường** (`allowMultiItemPerShift !== true`): giữ nguyên UI hiện tại (startIndex, endIndex, formulaType...).

**Máy multi-item** (`allowMultiItemPerShift === true`): thay thế toàn bộ phần form startIndex/endIndex/NE/output bằng:

```tsx
{
  machineAssignments[currentMachine.id]?.map((a) => (
    <div
      key={a.itemId}
      style={{
        marginBottom: 16,
        padding: 16,
        background: "#f6f8fa",
        borderRadius: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
        {a.item.name}
        {a.fromSpindle && (
          <Tag style={{ marginLeft: 8 }}>
            Cọc {a.fromSpindle}-{a.toSpindle}
          </Tag>
        )}
      </div>
      <InputNumber
        value={multiInputStates[currentMachine.id]?.[a.itemId]}
        onChange={(v) =>
          setMultiInputStates((prev) => ({
            ...prev,
            [currentMachine.id]: { ...prev[currentMachine.id], [a.itemId]: v },
          }))
        }
        placeholder="Sản lượng (kg)"
        style={{ width: "100%", height: 56, fontSize: 24 }}
        controls={false}
        inputMode="decimal"
        min={0}
      />
    </div>
  ));
}
```

Nếu chưa có assignments: hiện thông báo "Chưa điều phối mặt hàng" + nút "Thêm mặt hàng" cho phép user tự gán tạm.

### 4.4 Sửa hàm handleSave cho máy multi-item:

```typescript
if (currentMachine.allowMultiItemPerShift) {
  const assignments = machineAssignments[currentMachine.id] ?? [];
  for (const a of assignments) {
    const kg = multiInputStates[currentMachine.id]?.[a.itemId];
    if (!kg || kg <= 0) continue;
    await fetch("/api/production/daily-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordDate: selectedDate.format("YYYY-MM-DD"),
        shift: selectedShift,
        machineId: currentMachine.id,
        itemId: a.itemId,
        startIndex: 0,
        endIndex: 0,
        inputNE: 0,
        finalOutput: kg,
        note: a.fromSpindle ? `Cọc ${a.fromSpindle}-${a.toSpindle}` : null,
      }),
    });
  }
  // Đánh dấu saved + chuyển máy tiếp
  // ... (giữ logic andNext giống máy thường)
  return;
}
// ... giữ nguyên logic handleSave cho máy thường bên dưới
```

### 4.5 Load phiên trước cho máy multi-item:

Trong hàm `loadPreviousIndexes`, thêm xử lý:

```typescript
if (m.allowMultiItemPerShift) {
  // Query tất cả ProductionLog cho máy này trong ca+ngày
  const res = await fetch(
    `/api/production/daily-input?machineId=${m.id}&date=${dateStr}&shift=${shift}&allItems=true`,
  );
  if (res.ok) {
    const logs = await res.json();
    // logs = array [{itemId, finalOutput}, ...]
    const multiState: Record<number, number> = {};
    for (const log of Array.isArray(logs) ? logs : []) {
      multiState[log.itemId] = log.finalOutput;
    }
    // Lưu vào multiInputStates
    setMultiInputStates((prev) => ({ ...prev, [m.id]: multiState }));
    newStates[m.id] = {
      ...newStates[m.id],
      saved: Object.keys(multiState).length > 0,
      output: Object.values(multiState).reduce((s, v) => s + v, 0),
    };
  }
  continue; // skip logic startIndex/endIndex cho máy này
}
```

API `daily-input` GET cần hỗ trợ param `allItems=true` để trả về tất cả records của máy+ngày+ca (không chỉ 1 record). Đọc file `src/app/api/production/daily-input/route.ts` và thêm logic này.

### 4.6 Nút "Đổi hàng giữa ca": ẩn cho máy multi-item (không cần — đã có nhiều ô sẵn).

---

**Không sửa file nào khác ngoài:**

- `src/app/production/mobile-input/page.tsx`
- `src/app/api/production/daily-input/route.ts` (thêm support `allItems` param)
