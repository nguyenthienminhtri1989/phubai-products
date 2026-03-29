import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const groups = await prisma.meterGroupCategory.findMany({
      orderBy: { groupName: "asc" },
    });
    return NextResponse.json(groups);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
