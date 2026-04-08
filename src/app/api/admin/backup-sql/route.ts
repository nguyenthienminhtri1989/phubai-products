import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import util from "util";
import { auth } from "@/auth";

const execPromise = util.promisify(exec);

export async function GET() {
    try {
        const session = await auth();
        if (session?.user?.role !== "ADMIN") {
            return NextResponse.json(
                { error: "Chỉ Admin mới được backup" },
                { status: 403 }
            );
        }

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new Error("Missing DATABASE_URL");

        const tempFilePath = path.join(os.tmpdir(), `backup_${Date.now()}.sql`);

        // Sử dụng URL kết nối trực tiếp với pg_dump
        const command = `pg_dump --clean -d "${dbUrl}" -f "${tempFilePath}"`;
        await execPromise(command);

        const fileContent = await fs.readFile(tempFilePath);
        await fs.unlink(tempFilePath).catch(() => {});

        return new NextResponse(fileContent, {
            headers: {
                "Content-Type": "application/sql",
                "Content-Disposition": `attachment; filename="backup-phubai-${new Date().toISOString().slice(0, 10)}.sql"`
            }
        });

    } catch (error: any) {
        console.error("SQL Backup Error:", error);
        return NextResponse.json({ error: error.message || "Lỗi khi tạo backup SQL" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (session?.user?.role !== "ADMIN") {
            return NextResponse.json(
                { error: "Chỉ Admin mới được restore" },
                { status: 403 }
            );
        }

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new Error("Missing DATABASE_URL");

        const tempFilePath = path.join(os.tmpdir(), `restore_${Date.now()}.sql`);
        
        // Nhận dữ liệu stream từ client và ghi ra file tạm
        const buffer = Buffer.from(await req.arrayBuffer());
        await fs.writeFile(tempFilePath, buffer);

        // phai xoa database trc hoac dung file dump co clean
        // Neu file sql co chua DROP TABLE thi ok. Neu khong, minh bao gom vao pg_dump --clean ROI nen ok.
        const command = `psql -d "${dbUrl}" -f "${tempFilePath}"`;
        await execPromise(command);

        await fs.unlink(tempFilePath).catch(() => {});

        return NextResponse.json({ message: "Khôi phục database từ file .sql thành công!" });
    } catch (error: any) {
        console.error("SQL Restore Error:", error);
        return NextResponse.json({ error: error.message || "Lỗi khi khôi phục database từ .sql" }, { status: 500 });
    }
}
