import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const _ur = (session.user as any)?.userRole as string | undefined;
    if (!_ur || !["ADMIN", "DIRECTOR", "FACTORY_MANAGER"].includes(_ur)) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");

    const logs = await prisma.iotImportLog.findMany({
      where: sourceId ? { sourceId: parseInt(sourceId) } : undefined,
      orderBy: { importedAt: "desc" },
      take: 100,
      include: {
        source: { select: { id: true, name: true } },
      },
    });

    // Lấy thông tin người import
    const userIds = logs.map((l) => l.importedById).filter((id): id is number => id !== null);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const userMap: Record<number, string> = {};
    for (const u of users) userMap[u.id] = u.fullName;

    const result = logs.map((l) => ({
      ...l,
      importedByName: l.importedById ? userMap[l.importedById] || null : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải lịch sử import" }, { status: 500 });
  }
}
