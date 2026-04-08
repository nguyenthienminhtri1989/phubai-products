import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import * as XLSX from "xlsx";

// Map tên cột (lowercase) → tên field trong DB
const HEADER_TO_FIELD: Record<string, string> = {
  name: "name",
  code: "code",
  ne: "ne",
  composition: "composition",
  twist: "twist",
  weavingstyle: "weavingStyle",
  material: "material",
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới được import mặt hàng" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Không tìm thấy file" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls"].includes(ext)) {
      return NextResponse.json(
        { error: "File phải là .xlsx hoặc .xls" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "File trống hoặc không có dữ liệu" },
        { status: 400 }
      );
    }

    // Row 0 là header, normalize về lowercase
    const headers = (rows[0] as any[]).map((h) =>
      String(h ?? "").trim().toLowerCase()
    );

    const nameIdx = headers.indexOf("name");
    if (nameIdx === -1) {
      return NextResponse.json(
        { error: 'Không tìm thấy cột "name" trong file' },
        { status: 400 }
      );
    }

    // Build index → field mapping
    const colMap: Record<number, string> = {};
    headers.forEach((h, i) => {
      const field = HEADER_TO_FIELD[h];
      if (field) colMap[i] = field;
    });

    // Parse các dòng dữ liệu
    const validItems: any[] = [];
    for (const row of (rows as any[][]).slice(1)) {
      const rawName = row[nameIdx];
      const name =
        rawName !== undefined && rawName !== null
          ? String(rawName).trim()
          : "";
      if (!name) continue;

      const item: any = { name };

      for (const [idxStr, field] of Object.entries(colMap)) {
        if (field === "name") continue;
        const idx = Number(idxStr);
        const raw = row[idx];

        if (raw === undefined || raw === null || String(raw).trim() === "") {
          item[field] = null;
        } else if (field === "ne" || field === "twist") {
          const parsed = parseInt(String(raw), 10);
          item[field] = isNaN(parsed) ? null : parsed;
        } else {
          item[field] = String(raw).trim();
        }
      }

      validItems.push(item);
    }

    if (validItems.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, total: 0 });
    }

    const result = await prisma.item.createMany({
      data: validItems,
      skipDuplicates: true,
    });

    return NextResponse.json({
      imported: result.count,
      skipped: validItems.length - result.count,
      total: validItems.length,
    });
  } catch (error) {
    console.error("[items/import]", error);
    return NextResponse.json({ error: "Lỗi import dữ liệu" }, { status: 500 });
  }
}
