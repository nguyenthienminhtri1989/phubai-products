Viết lại ActualProductionGrid.tsx — grid TH hoàn toàn độc lập với KH
Bỏ hoàn toàn logic dựa vào segments để render. Grid TH tự build từ grid data (kd_daily_inputs).
Logic mới:

1. Từ grid data, extract danh sách dòng hiển thị:
   - Mỗi dòng = 1 combo (machineId, itemId)
   - Sort theo machineId ASC, rồi ngày đầu tiên xuất hiện ASC

2. Mỗi ô (machineId, day):
   - Nếu có data cho itemId của dòng đó → hiện SL thực tế
   - Không có → hiện "·"

3. Định mức trong ngoặc (): tra từ segments KH nếu có, không có thì bỏ trống

4. Cột TỔNG = sum SL thực tế của dòng đó cả tháng
5. Hàng TỔNG/NGÀY = sum tất cả máy trong ngày đó
   Cụ thể — thay thế toàn bộ phần build rows:
   typescript// THAY THẾ sortedSegs, virtualSegs, allSegs bằng:

// Build rows từ grid data (kd_daily_inputs) — hoàn toàn độc lập với KH
interface GridRow {
machineId: number;
itemId: number;
machineName: string;
machineModel: string | null;
itemName: string;
firstDay: number; // ngày đầu tiên có SL
lastDay: number; // ngày cuối cùng có SL
}

const rowMap = new Map<string, GridRow>(); // key = "machineId-itemId"

for (const [machineIdStr, machineGrid] of Object.entries(grid)) {
const machineId = parseInt(machineIdStr);
for (const [dayStr, dayData] of Object.entries(machineGrid)) {
const day = parseInt(dayStr);
for (const [itemIdStr, kg] of Object.entries(dayData)) {
const itemId = parseInt(itemIdStr);
if (kg <= 0) continue;
const key = `${machineId}-${itemId}`;
if (!rowMap.has(key)) {
// Tìm tên máy
const machine = apiMachines.find(m => m.id === machineId)
?? segments.find(s => s.machineId === machineId)?.machine;
// Tìm tên item
const item = resolvedItems.find(i => i.id === itemId);
rowMap.set(key, {
machineId,
itemId,
machineName: machine?.name ?? `Máy ${machineId}`,
machineModel: machine?.model ?? null,
itemName: item?.name ?? `Item #${itemId}`,
firstDay: day,
lastDay: day,
});
} else {
const row = rowMap.get(key)!;
if (day < row.firstDay) row.firstDay = day;
if (day > row.lastDay) row.lastDay = day;
}
}
}
}

const gridRows = Array.from(rowMap.values()).sort((a, b) =>
a.machineId !== b.machineId ? a.machineId - b.machineId : a.firstDay - b.firstDay
);

// Tính rowSpan cho cột Máy
const machineRowSpanNew: Record<number, number> = {};
for (const row of gridRows) {
machineRowSpanNew[row.machineId] = (machineRowSpanNew[row.machineId] ?? 0) + 1;
}
const machineFirstSeenNew: Record<number, boolean> = {};
Phần render tbody — dùng gridRows thay vì allSegs:
tsx{gridRows.map((row, rowIdx) => {
const rowKey = `${row.machineId}-${row.itemId}`;
const isFirstOfMachine = !machineFirstSeenNew[row.machineId];
if (isFirstOfMachine) machineFirstSeenNew[row.machineId] = true;
const span = machineRowSpanNew[row.machineId];
const isSelected = selectedKey === rowKey;
const rowBg = isSelected ? "#fffbe6" : rowIdx % 2 === 0 ? "#fff" : "#fafafa";
const machineGrid = grid[row.machineId] ?? {};
const itemColor = getColor(row.itemId, itemColors);

// Tổng TH của dòng này
let rowTotal = 0;
for (const day of dayNumbers) {
if (!holidays.includes(day)) {
rowTotal += machineGrid[day]?.[row.itemId] ?? 0;
}
}

// Tra định mức KH (nếu có segment tương ứng) — chỉ để hiển thị tham khảo
const matchingSeg = segments.find(s => s.machineId === row.machineId && s.itemId === row.itemId);

return (

<tr key={rowKey} style={{ background: rowBg, cursor: "pointer" }}
onClick={() => setSelectedKey(prev => prev === rowKey ? null : rowKey)}>

      {isFirstOfMachine && (
        <td rowSpan={span} style={{ ...tdStyle, textAlign: "left", paddingLeft: 8,
          position: "sticky", left: 0, zIndex: 1, background: "#f5f5f5",
          minWidth: 80, fontWeight: 700, borderRight: "2px solid #b0b0b0", verticalAlign: "middle" }}>
          {row.machineName}
          {row.machineModel && <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>{row.machineModel}</div>}
        </td>
      )}

      <td style={{ ...tdStyle, position: "sticky", left: 80, zIndex: 1,
        background: isSelected ? "#fffbe6" : getBg(row.itemId, itemColors),
        minWidth: 110, borderRight: "2px solid #b0b0b0" }}>
        <div style={{ fontSize: 12, color: itemColor, fontWeight: 700 }}>{row.itemName}</div>
        <div style={{ fontSize: 10, color: "#888" }}>({row.firstDay}–{row.lastDay})</div>
      </td>

      {dayNumbers.map(day => {
        const isHoliday = holidays.includes(day);
        const actualKg = machineGrid[day]?.[row.itemId] ?? 0;
        const hasData = actualKg > 0;
        // Định mức KH tham khảo: chỉ hiện nếu có segment KH khớp ngày này
        const planKg = matchingSeg && day >= matchingSeg.fromDay && day <= matchingSeg.toDay
          ? matchingSeg.kgPerDay : 0;

        if (isHoliday) {
          return <td key={day} style={{ ...tdStyle, background: "#ffebe8" }}>
            <span style={{ color: "#aaa", fontSize: 11 }}>—</span>
          </td>;
        }

        return (
          <td key={day} style={{ ...tdStyle,
            background: hasData ? getBg(row.itemId, itemColors) : undefined,
            borderLeft: "1px solid #d0d0d0" }}>
            {hasData ? (
              <div>
                <span style={{ color: planKg > 0 ? compareColor(actualKg, planKg) : "#595959",
                  fontSize: 11, fontWeight: 800 }}>
                  {actualKg.toLocaleString()}
                </span>
                {planKg > 0 && (
                  <div style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>({planKg.toLocaleString()})</div>
                )}
              </div>
            ) : (
              <span style={{ color: "#d9d9d9", fontSize: 13 }}>·</span>
            )}
          </td>
        );
      })}

      <td style={{ ...tdStyle, background: "#dbeeff", fontWeight: 800, fontSize: 13,
        color: "#0050b3", borderLeft: "2px solid #b0b0b0" }}>
        {rowTotal > 0 ? `${rowTotal.toLocaleString()} kg` : <span style={{ color: "#bbb" }}>—</span>}
      </td>
    </tr>

);
})}
Props segments vẫn nhận từ parent nhưng chỉ dùng để hiển thị định mức tham khảo trong ngoặc (), KHÔNG dùng để quyết định dòng nào hiển thị.

Tóm tắt: Grid TH tự build dòng từ kd_daily_inputs data. Máy/mặt hàng nào có SL thực tế thì hiện, không cần segment KH. Định mức KH chỉ là tham khảo trong ngoặc.
