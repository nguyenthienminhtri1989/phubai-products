Đưa cho Claude Code:

---

**Fix: Cho phép 2 segment trên cùng 1 máy overlap ngày (1 máy chạy 2 mặt hàng trong cùng 1 ngày)**

Hiện tại khi thêm segment, hệ thống báo lỗi overlap nếu 2 segment cùng machineId có ngày trùng nhau. VD: máy 5 chạy MH A ngày 1-5, muốn thêm MH B ngày 5-15 → bị chặn vì ngày 5 trùng.

Thực tế sản xuất: 1 máy có thể đổi mặt hàng trong cùng 1 ngày → ngày 5 chạy cả A lẫn B.

**Cần sửa:** Bỏ hoặc nới lỏng logic kiểm tra overlap trong API tạo/sửa segment.

Tự tìm và đọc file `src/app/api/kdsx/production-schedule/[id]/segments/route.ts` và `src/app/api/kdsx/production-schedule/[id]/segments/[segmentId]/route.ts`, tìm đoạn code kiểm tra overlap (thường có từ khóa `overlap`, `conflict`, `fromDay`, `toDay` trong điều kiện `where`).

**Sửa:** Cho phép overlap nếu **khác itemId**. Chỉ chặn nếu **cùng machineId + cùng itemId + trùng ngày** (vì không có ý nghĩa khi cùng 1 máy chạy cùng 1 mặt hàng trong 2 segment chồng nhau).

```typescript
// CŨ: chặn mọi overlap trên cùng máy
where: {
  scheduleId,
  machineId,
  // overlap check...
}

// MỚI: chỉ chặn overlap cùng máy + cùng mặt hàng
where: {
  scheduleId,
  machineId,
  itemId,  // THÊM: chỉ check overlap trong cùng mặt hàng
  // overlap check...
}
```

Không sửa gì ở frontend — chỉ sửa logic validate ở backend API.
