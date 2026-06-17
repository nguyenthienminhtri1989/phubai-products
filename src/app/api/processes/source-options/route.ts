import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Chua dang nhap" }, { status: 401 });
    }

    const processes = await prisma.process.findMany({
      where: { revenueFactoryId: { not: null } },
      select: {
        id: true,
        name: true,
        revenueFactory: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(processes);
  } catch (error: unknown) {
    console.error("Source process options error:", error);
    return NextResponse.json(
      { error: "Loi lay danh sach nguon soi" },
      { status: 500 },
    );
  }
}
