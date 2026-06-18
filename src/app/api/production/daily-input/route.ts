import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
// runAllocation đã chuyển sang đọc từ KdDailyInput
// Xem src/lib/allocation-engine.ts → runAllocationKD()
// import { runAllocation } from "@/lib/allocation-engine";

// Chuẩn hóa ngày về 00:00:00 UTC để khớp với @db.Date của Prisma/PostgreSQL
const normalizeDate = (dateStr: string) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const machineId = searchParams.get("machineId");
  const date = searchParams.get("date");
  const shift = searchParams.get("shift");
  const allItems = searchParams.get("allItems") === "true";

  if (!machineId || !date || !shift) return NextResponse.json(null);

  // allItems=true: trả về tất cả records của máy+ngày+ca (dùng cho máy multi-item)
  if (allItems) {
    const logs = await prisma.productionLog.findMany({
      where: {
        machineId: parseInt(machineId),
        recordDate: normalizeDate(date),
        shift: parseInt(shift),
      },
      select: { id: true, itemId: true, finalOutput: true },
    });
    return NextResponse.json(logs);
  }

  const log = await prisma.productionLog.findFirst({
    where: {
      machineId: parseInt(machineId),
      recordDate: normalizeDate(date),
      shift: parseInt(shift),
    },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(log ?? null);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const body = await request.json();
    const { recordDate, note, efficiency } = body;
    const bodyLotId: number | null = body.lotId != null ? parseInt(body.lotId) : null;
    let {
      machineId,
      shift,
      itemId,
      startIndex,
      endIndex,
      inputNE,
      finalOutput,
    } = body;

    // 1. Ép kiểu dữ liệu an toàn
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex != null ? parseFloat(startIndex) : 0;
    endIndex = endIndex != null ? parseFloat(endIndex) : null;
    inputNE = inputNE != null ? parseFloat(inputNE) : null;
    finalOutput = finalOutput != null ? Math.round(parseFloat(finalOutput)) : 0;
    // efficiency: optional, lưu dạng % (0–100), null nếu không nhập
    const efficiencyVal = efficiency != null && efficiency !== "" ? parseFloat(efficiency) : null;

    if (isNaN(machineId) || isNaN(shift) || isNaN(itemId)) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }

    // 2. Chuẩn hóa ngày
    const dateObj = normalizeDate(recordDate);

    // 3. Kiểm tra quyền
    // Mọi user đã đăng nhập đều được ghi nhập liệu sản xuất

    const dataToSave = {
      machineId,
      recordDate: dateObj,
      shift,
      itemId,
      startIndex,
      endIndex,
      inputNE,
      finalOutput,
      efficiency: efficiencyVal,
      note,
      createdById: parseInt(session.user.id),
    };

    // lotId ưu tiên từ body (máy multi-item truyền từ assignment),
    // fallback về machine.currentLotId (máy thường — công nhân không cần chọn)
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      select: {
        allowMultiItemPerShift: true,
        currentLotId: true,
        currentSourceProcessId: true,
      },
    });
    const lotId = bodyLotId ?? machine?.currentLotId ?? null;
    let resolvedSourceProcessId = machine?.currentSourceProcessId ?? null;
    if (machine?.allowMultiItemPerShift) {
      const assignment = await prisma.machineItemAssignment.findFirst({
        where: {
          machineId,
          itemId,
          isActive: true,
          lotId: lotId == null ? null : lotId,
        },
        select: { sourceProcessId: true },
      });
      resolvedSourceProcessId =
        assignment?.sourceProcessId ?? machine.currentSourceProcessId ?? null;
    }

    // 4. Tìm log đã tồn tại với key 5 cột (bao gồm lotId).
    //    Unique constraint cũ 4 cột đã được thay bằng 2 partial unique index
    //    (prod_log_unique_with_lot / prod_log_unique_no_lot), nên không còn dùng upsert.
    //    Phải tách 2 nhánh vì lotId nullable: lotId=NULL khác với lotId=<số>.
    let existing;
    if (lotId == null) {
      existing = await prisma.productionLog.findFirst({
        where: {
          machineId,
          recordDate: dateObj,
          shift,
          itemId,
          lotId: null,
        },
      });
    } else {
      existing = await prisma.productionLog.findFirst({
        where: {
          machineId,
          recordDate: dateObj,
          shift,
          itemId,
          lotId,
        },
      });
    }

    const savedLog = existing
      ? await prisma.productionLog.update({
          where: { id: existing.id },
          data: { ...dataToSave, lotId },
        })
      : await prisma.productionLog.create({
        data: {
            ...dataToSave,
            lotId,
            sourceProcessId: resolvedSourceProcessId,
          },
        });

    // 5. Cập nhật thông tin máy — chỉ khi nhập cho ngày hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const recordDay = new Date(dateObj);
    recordDay.setHours(0, 0, 0, 0);
    if (recordDay.getTime() === today.getTime()) {
      await prisma.machine.update({
        where: { id: machineId },
        data: {
          currentItemId: itemId,
          ...(inputNE ? { currentNE: parseFloat(inputNE) } : {}),
        },
      });
    }

    // 6. Allocation engine đã chuyển sang đọc từ KdDailyInput.
    //    Phòng KD nhập liệu qua /api/kd-daily-input sẽ tự động gọi runAllocationKD.
    //    Xem src/lib/allocation-engine.ts → runAllocationKD()
    // try {
    //   const machine = await prisma.machine.findUnique({
    //     where: { id: machineId },
    //     include: { process: true },
    //   });
    //   if (machine?.process?.factoryId) {
    //     await runAllocation(machine.process.factoryId, dateObj);
    //   }
    // } catch (err) {
    //   console.error("Allocation error (non-blocking):", err);
    // }

    return NextResponse.json(savedLog);
  } catch (error: unknown) {
    console.error("Save Error Details:", error);
    // Nếu vẫn lỗi P2002 sau khi dùng upsert, có thể do itemId bị thay đổi
    return NextResponse.json(
      {
        error: "Lỗi lưu dữ liệu",
        detail:
          typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
            ? "Bản ghi này (máy + ngày + ca + sợi + lô) đã tồn tại. Vui lòng chọn lô khác hoặc kiểm tra dữ liệu hiện có."
            : error instanceof Error ? error.message : "Lỗi không xác định",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Phân quyền: ADMIN hoặc các role quản lý mới được xóa
  const userRole = (session.user as { userRole?: string })?.userRole;
  const ALLOWED_DELETE_ROLES = ["ADMIN", "DIRECTOR", "FACTORY_MANAGER", "STATISTICIAN"];
  if (!userRole || !ALLOWED_DELETE_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Không có quyền xóa bản ghi" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || isNaN(parseInt(id))) {
    return NextResponse.json({ error: "Thiếu hoặc sai id" }, { status: 400 });
  }

  try {
    await prisma.productionLog.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi xóa bản ghi", detail: error instanceof Error ? error.message : "Lỗi không xác định" }, { status: 500 });
  }
}

// CODE ĐÃ THỰC SỰ ĐƯỢC ĐẨY LÊN GIT CHƯA??????
