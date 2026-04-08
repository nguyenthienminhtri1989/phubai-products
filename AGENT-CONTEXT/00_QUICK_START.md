# 🚀 QUICK START — Phu Bai ERP

> **Đọc file này TRƯỚC KHI làm bất cứ điều gì.**
> Sau đó đọc file PLAN được giao. Chỉ đọc thêm các file khác khi PLAN yêu cầu.

---

## 1. Dự án là gì?

Phần mềm ERP quản lý sản xuất sợi cho **3 nhà máy** (NM1.2, NMG37, NM3).
Tech stack: **Next.js App Router · Prisma ORM · PostgreSQL · Ant Design · NextAuth.js v5 · TypeScript strict**.

---

## 2. Cấu trúc thư mục quan trọng

```
src/
├── app/
│   ├── api/              ← Tất cả API routes (Route Handlers)
│   │   ├── production/   ← Sản lượng, dừng máy
│   │   ├── kdsx/         ← Kế hoạch kinh doanh - sản xuất
│   │   ├── iot/          ← Import IoT Excel
│   │   └── productivity-benchmark/
│   ├── (các page)/       ← UI pages theo từng module
│   └── ...
├── components/           ← Shared UI components
├── lib/                  ← Business logic thuần (không import React)
│   ├── allocation-engine.ts
│   ├── kdsx/calculator.ts
│   └── estimate-completion.ts
├── utils/
│   └── benchmark.ts      ← calcTheoreticalOutput() dùng chung
prisma/
├── schema.prisma
└── migrations/
```

---

## 5 RULE BẤT BIẾN — Vi phạm là sai hoàn toàn

| #   | Rule                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------ |
| 1   | **Strictly additive** — KHÔNG sửa/xóa model, field, logic đã tồn tại. Chỉ thêm mới.                    |
| 2   | **Backend is source of truth** — Mọi tính toán ở server. Frontend chỉ gửi raw input và render kết quả. |
| 3   | **Unique constraint ProductionLog** = `(machineId, recordDate, shift, itemId)` — KHÔNG thay đổi.       |
| 4   | **`yearMonth` luôn là String `"YYYY-MM"`** — KHÔNG dùng DateTime cho trường này.                       |
| 5   | **ID dùng `Int` autoincrement** — KHÔNG dùng cuid/uuid.                                                |

---

## Phân cấp dữ liệu

```
Factory → Process → Machine
Factory → Substation → EnergyMeter
```

Một User được gán vào **1 Process** (`processId`). User chỉ nhập liệu trong process của mình, chỉ xem (read-only) process khác.

---

## Các helper đã có — KHÔNG tự viết lại

| Helper                     | Vị trí                           | Dùng cho                                   |
| -------------------------- | -------------------------------- | ------------------------------------------ |
| `calcTheoreticalOutput()`  | `src/utils/benchmark.ts`         | Tính NS lý thuyết theo rpm/mpm             |
| `calculateLineItem()`      | `src/lib/kdsx/calculator.ts`     | Tính doanh thu, chi phí NVL, lợi nhuận     |
| `refreshSummarySnapshot()` | `src/lib/kdsx/calculator.ts`     | Cập nhật cache dashboard KD-SX             |
| `runAllocation()`          | `src/lib/allocation-engine.ts`   | Phân bổ sản lượng vào đơn hàng (waterfall) |
| `recalculateAllocation()`  | `src/lib/allocation-engine.ts`   | Tính lại phân bổ theo khoảng ngày          |
| `calcEstimatedDoneDate()`  | `src/lib/estimate-completion.ts` | Ước tính ngày hoàn thành HĐ                |

---

## Khi cần hiểu sâu hơn → đọc file tương ứng

| Cần hiểu về                                            | Đọc file                             |
| ------------------------------------------------------ | ------------------------------------ |
| Công thức tính sản lượng, ca làm việc, traceability    | `AGENT_CONTEXT/01_BUSINESS_LOGIC.md` |
| Schema Prisma, API conventions, auth pattern           | `AGENT_CONTEXT/02_ARCHITECTURE.md`   |
| Anti-patterns, lỗi hay gặp, checklist trước khi commit | `AGENT_CONTEXT/03_CODING_RULES.md`   |
| Yêu cầu cụ thể đang làm                                | `PLANS/PLAN_[feature-name].md`       |
