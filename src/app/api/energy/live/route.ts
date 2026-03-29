import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ModbusRTU from "modbus-serial";

function parseSelecFloat(buffer: Buffer, offset = 0) {
  const byteC = buffer[offset + 0];
  const byteD = buffer[offset + 1];
  const byteA = buffer[offset + 2];
  const byteB = buffer[offset + 3];

  const fixedBuffer = Buffer.alloc(4);
  fixedBuffer[0] = byteA;
  fixedBuffer[1] = byteB;
  fixedBuffer[2] = byteC;
  fixedBuffer[3] = byteD;

  return fixedBuffer.readFloatBE(0);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const meterId = searchParams.get("meterId");

  if (!meterId)
    return NextResponse.json({ error: "Thiếu ID" }, { status: 400 });

  const meter = await prisma.powerMeter.findUnique({
    where: { id: Number(meterId) },
  });

  if (!meter || !meter.isAuto || !meter.gatewayIp || !meter.modbusId) {
    return NextResponse.json({ error: "Chưa cấu hình IoT" }, { status: 400 });
  }

  const client = new ModbusRTU();
  try {
    await client.connectTCP(meter.gatewayIp.trim(), {
      port: meter.gatewayPort,
    });
    client.setID(meter.modbusId);
    client.setTimeout(2000);

    // 1. CHỈ ĐỌC Số chữ điện (0x00)
    const data0 = await client.readInputRegisters(0, 2);
    const totalEnergy = parseSelecFloat(data0.buffer, 0);

    await delay(100); // Nghỉ 100ms cho chắc chắn

    // 2. CHỈ ĐỌC Công suất (0x0E / Decimal 14)
    const data1 = await client.readInputRegisters(14, 2);
    const kw = parseSelecFloat(data1.buffer, 0);

    const totalKw = kw * (meter.tu * meter.ti);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalEnergy: Number(totalEnergy.toFixed(1)),
      power: Number(totalKw.toFixed(2)),
      // Tạm thời gán bằng 0 cho các thông số chưa chắc chắn địa chỉ
      voltage: 0,
      current: 0,
      pf: 0,
    });
  } catch (error: any) {
    // IN LỖI THỰC SỰ RA TERMINAL ĐỂ BẮT BỆNH
    console.error(`====== LỖI ĐỒNG HỒ ID ${meter?.modbusId} ======`);
    console.error("Chi tiết lỗi:", error.message);
    return NextResponse.json({ error: "Mất kết nối" }, { status: 503 });
  } finally {
    client.close();
  }
}
