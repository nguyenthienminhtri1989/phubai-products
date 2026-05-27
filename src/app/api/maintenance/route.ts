import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export function GET() {
  const flagPath = path.join(process.cwd(), "maintenance.flag");
  return NextResponse.json({ active: fs.existsSync(flagPath) });
}
