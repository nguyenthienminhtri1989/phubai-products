# TASK: Hiển thị cột "Lô" trên giao diện nhập sản lượng & báo cáo

## Bối cảnh

Module Lot Management đã hoàn thành: Schema, API CRUD, UI danh mục `/lots`,
điều phối máy chọn lô, ProductionLog tự nhận lotId từ Machine.currentLotId.

**Chỉ còn thiếu:** hiển thị tên lô trên các trang xem/nhập ProductionLog.

---

## Đọc các file sau trước khi sửa:

- `src/app/production/daily-input/page.tsx` (nhập SL dạng thẻ — mobile)
- `src/app/production/daily-input-grid/page.tsx` (nhập SL dạng bảng)
- `src/app/production/history/page.tsx` (lịch sử & báo cáo)
- `src/app/api/production/daily-input/route.ts` (API nhập SL — đã có lotId)
- Bất kỳ trang nào khác render bảng ProductionLog

---

## 1. Trang lịch sử & báo cáo sản lượng

### File: `src/app/production/history/page.tsx`

**1.1 API query thêm include lot:**
Tìm chỗ fetch ProductionLog, thêm include:

```typescript
include: {
  lot: { select: { id: true, lotNumber: true } },
  // ... giữ nguyên các include khác (machine, item, createdBy...)
}
```

**1.2 Thêm cột "Lô" vào Table, đặt ngay SAU cột "Mặt hàng":**

```tsx
{
  title: "Lô",
  dataIndex: ["lot", "lotNumber"],
  key: "lot",
  width: 120,
  render: (val: string) => val || "—",
},
```

---

## 2. Trang nhập sản lượng dạng bảng (Grid)

### File: `src/app/production/daily-input-grid/page.tsx`

**2.1 Hiển thị tên lô (read-only) ngay sau cột mặt hàng:**

```tsx
{
  title: "Lô",
  key: "lot",
  width: 120,
  render: (_: any, record: any) => {
    const lotNumber = record.machine?.currentLot?.lotNumber;
    return lotNumber
      ? <Tag color="orange">{lotNumber}</Tag>
      : <span style={{ color: '#ccc' }}>—</span>;
  },
},
```

**2.2 API GET machines cần include currentLot (nếu chưa có):**

```typescript
include: {
  currentLot: { select: { id: true, lotNumber: true } },
}
```

---

## 3. Trang nhập sản lượng dạng thẻ (Mobile)

### File: `src/app/production/daily-input/page.tsx`

**3.1 Hiển thị tên lô trên mỗi thẻ máy (read-only, dưới tên mặt hàng):**

```tsx
{
  machine.currentLot?.lotNumber && (
    <div style={{ fontSize: 12, color: "#fa8c16" }}>
      Lô: {machine.currentLot.lotNumber}
    </div>
  );
}
```

**3.2 Đảm bảo API trả về currentLot khi load danh sách máy.**

---

## 4. Kiểm tra thêm các trang khác

Tìm tất cả trang hiển thị ProductionLog và thêm cột "Lô" nếu phù hợp:

```powershell
Get-ChildItem -Recurse src -Filter "*.tsx" | Select-String -Pattern "ProductionLog|productionLog|finalOutput.*machine" -List | Select-Object Path
```

Các trang có thể cần thêm:

- `/reports/production` (biểu đồ sản lượng — có thể không cần cột, nhưng kiểm tra)
- `/production/mobile-report` (báo cáo mobile)

---

## 5. Verify

```powershell
# Cột lô trên lịch sử
Select-String -Pattern "lotNumber|lot\." -LiteralPath "src\app\production\history\page.tsx" | Select-Object -First 3

# Cột lô trên grid
Select-String -Pattern "lotNumber|currentLot" -LiteralPath "src\app\production\daily-input-grid\page.tsx" | Select-Object -First 3

# Cột lô trên mobile
Select-String -Pattern "lotNumber|currentLot" -LiteralPath "src\app\production\daily-input\page.tsx" | Select-Object -First 3
```
