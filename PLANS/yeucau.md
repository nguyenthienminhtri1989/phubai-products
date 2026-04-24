File: src/components/kdsx/ActualProductionGrid.tsx
Sau dòng const sortedSegs = [...], thêm logic tạo "virtual segments" cho máy có SL thực tế nhưng không có trong KH:
typescriptconst sortedSegs = [...segments].sort((a, b) =>
a.machineId !== b.machineId ? a.machineId - b.machineId : a.fromDay - b.fromDay
);

// Tạo virtual segments cho máy/mặt hàng có SL thực tế nhưng không có segment KH
const virtualSegs: Segment[] = [];
for (const machineIdStr of Object.keys(grid)) {
const machineId = parseInt(machineIdStr);
const machineGrid = grid[machineId];
if (!machineGrid) continue;

// Tìm tất cả itemId thực tế của máy này
const actualItemIds = new Set<number>();
for (const dayData of Object.values(machineGrid)) {
actualItemIds.add(dayData.itemId);
}

for (const itemId of actualItemIds) {
// Kiểm tra đã có segment KH cho combo (machineId, itemId) chưa
const hasSegment = segments.some(s => s.machineId === machineId && s.itemId === itemId);
if (hasSegment) continue;

    // Tìm thông tin máy từ apiMachines hoặc segments
    const machineInfo = apiMachines.find(m => m.id === machineId)
      ?? segments.find(s => s.machineId === machineId)?.machine
      ?? { id: machineId, name: `Máy ${machineId}`, model: null, processId: 0 };

    // Tìm ngày min/max có SL thực tế cho item này
    let minDay = totalDays, maxDay = 1;
    for (const [dayStr, dayData] of Object.entries(machineGrid)) {
      if (dayData.itemId === itemId) {
        const d = parseInt(dayStr);
        if (d < minDay) minDay = d;
        if (d > maxDay) maxDay = d;
      }
    }

    virtualSegs.push({
      id: -(machineId * 1000 + itemId), // id âm để phân biệt
      machineId,
      itemId,
      fromDay: minDay,
      toDay: maxDay,
      kgPerDay: 0, // không có định mức KH
      machine: machineInfo,
      item: { id: itemId, name: `Item #${itemId}` }, // tên sẽ lấy từ API
    });

}
}

// Gộp và sort lại
const allSegs = [...sortedSegs, ...virtualSegs].sort((a, b) =>
a.machineId !== b.machineId ? a.machineId - b.machineId : a.fromDay - b.fromDay
);
Sau đó thay sortedSegs bằng allSegs trong phần render:
typescript// CŨ:
{sortedSegs.map((seg, rowIdx) => { ... })}

// MỚI:
{allSegs.map((seg, rowIdx) => { ... })}
Cũng cần cập nhật machineRowSpan và machineFirstSeen để dùng allSegs thay vì sortedSegs.
Tuy nhiên, virtual segments thiếu item.name. Cần sửa API actual để trả thêm items:
File: src/app/api/kdsx/production-schedule/[id]/actual/route.ts
Thêm trả về danh sách items:
typescript// Sau khi build grid, lấy tất cả itemId
const allItemIds = [...new Set(data.map(d => d.itemId))];
const items = await prisma.item.findMany({
where: { id: { in: allItemIds } },
select: { id: true, name: true },
});

return NextResponse.json({ grid, source, machines, items }); // thêm items
Trong component, lưu apiItems tương tự apiMachines, rồi dùng khi tạo virtual segment:
typescriptitem: apiItems.find(i => i.id === itemId) ?? { id: itemId, name: `Item #${itemId}` },

Tóm tắt: sửa 2 files, logic chính là tạo "virtual segments" từ dữ liệu thực tế để grid TH hiển thị đầy đủ kể cả máy/mặt hàng không có trong KH.
