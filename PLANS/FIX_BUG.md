API route cũng bị lỗi tương tự — **`params` là Promise trong Next.js 15+**, phải `await`. Đưa cho Claude Code fix:

---

**File: `src/app/api/kdsx/production-schedule/[id]/route.ts`**

Sửa cả 3 handler GET, PUT, DELETE — thêm `await params`:

```typescript
// GET
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  // ... giữ nguyên phần còn lại
}

// PUT
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  // ... giữ nguyên phần còn lại
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  // ... giữ nguyên phần còn lại
}
```

---

**Lưu ý quan trọng:** Lỗi này sẽ xuất hiện ở **tất cả các API route có `[id]` trong path** của project. Sau khi fix file này, Claude Code cần kiểm tra và fix luôn các route tương tự:

```powershell
Get-ChildItem -Recurse "src\app\api\kdsx\production-schedule\" -Filter "route.ts" | Select-Object FullName
```

Có 5 route files trong thư mục này — tất cả đều cần fix `params` thành `Promise<{ id: string }>` và `await params`. Đặc biệt là `segments/[segmentId]/route.ts` có 2 params lồng nhau (`id` và `segmentId`) đều phải await.
