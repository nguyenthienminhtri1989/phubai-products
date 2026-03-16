import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface ImportRow {
  mappedDate: string;
  mappedShift: number;
  mappedMachineId: number;
  mappedItemId: number;
  finalOutput: number;
  action: "INSERT" | "UPDATE";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (
      (session.user as any).role !== "ADMIN" &&
      (session.user as any).accessLevel !== "MANAGER"
    )
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

    const body = await req.json();
    const { sourceId, fileName, rows } = body as {
      sourceId: number;
      fileName: string;
      rows: ImportRow[];
    };

    if (!sourceId || !fileName || !rows?.length) {
      return NextResponse.json({ error: "Thiếu dữ liệu import" }, { status: 400 });
    }

    const source = await prisma.iotSource.findUnique({ where: { id: sourceId } });
    if (!source)
      return NextResponse.json({ error: "Không tìm thấy nguồn IoT" }, { status: 404 });

    const userId = session.user.id ? parseInt(session.user.id) : null;
    const noteText = `Import từ IoT: ${source.name}`;

    // Validate rows phía server
    const validRows = rows.filter(
      (r) =>
        r.mappedDate &&
        r.mappedShift &&
        r.mappedMachineId &&
        r.mappedItemId &&
        (r.action === "INSERT" || r.action === "UPDATE")
    );

    const insertRows = validRows.filter((r) => r.action === "INSERT");
    const updateRows = validRows.filter((r) => r.action === "UPDATE");
    const skippedRows = rows.length - validRows.length;

    // Build transaction operations
    const ops = validRows.map((row) => {
      const recordDate = new Date(row.mappedDate);

      if (row.action === "INSERT") {
        return prisma.productionLog.create({
          data: {
            machineId: row.mappedMachineId,
            recordDate,
            shift: row.mappedShift,
            itemId: row.mappedItemId,
            finalOutput: row.finalOutput,
            startIndex: 0,
            endIndex: null,
            inputNE: null,
            note: noteText,
            createdById: userId,
          },
        });
      } else {
        return prisma.productionLog.updateMany({
          where: {
            machineId: row.mappedMachineId,
            recordDate,
            shift: row.mappedShift,
            itemId: row.mappedItemId,
          },
          data: {
            finalOutput: row.finalOutput,
            note: noteText,
          },
        });
      }
    });

    let insertedRows = 0;
    let updatedRows = 0;
    let errorRows = 0;
    let logStatus: string;
    let errorDetails: any[] = [];

    try {
      await prisma.$transaction(ops);
      insertedRows = insertRows.length;
      updatedRows = updateRows.length;
      logStatus = "SUCCESS";
    } catch (txError: any) {
      // Transaction failed — tất cả đều rollback
      errorRows = validRows.length;
      insertedRows = 0;
      updatedRows = 0;
      logStatus = "FAILED";
      errorDetails = [{ reason: txError.message || "Lỗi transaction" }];
    }

    const totalRows = rows.length;
    if (logStatus === "SUCCESS" && skippedRows > 0) {
      logStatus = "PARTIAL";
    }

    // Tạo import log dù thành công hay thất bại
    await prisma.iotImportLog.create({
      data: {
        sourceId,
        fileName,
        totalRows,
        insertedRows,
        updatedRows,
        skippedRows,
        errorRows,
        status: logStatus,
        errorDetail: errorDetails.length > 0 ? errorDetails : undefined,
        importedById: userId,
      },
    });

    return NextResponse.json({
      success: logStatus !== "FAILED",
      insertedRows,
      updatedRows,
      skippedRows,
      errorRows,
      status: logStatus,
      errorDetails,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi thực hiện import" }, { status: 500 });
  }
}
