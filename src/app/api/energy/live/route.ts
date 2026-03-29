import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ModbusRTU from "modbus-serial";

// Hàm đảo Byte (CDAB -> ABCD)
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

// Hàm tạo nhịp nghỉ cho Gateway
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const meterId = searchParams.get("meterId");

  if (!meterId) {
    return NextResponse.json({ error: "Thiếu ID đồng hồ" }, { status: 400 });
  }

  const meter = await prisma.powerMeter.findUnique({
    where: { id: Number(meterId) },
  });

  if (!meter || !meter.isAuto || !meter.gatewayIp || !meter.modbusId) {
    return NextResponse.json(
      { error: "Đồng hồ này chưa cấu hình IoT" },
      { status: 400 },
    );
  }

  const client = new ModbusRTU();
  try {
    // Cắt bỏ khoảng trắng thừa nếu nhập nhầm ở IP
    await client.connectTCP(meter.gatewayIp.trim(), {
      port: meter.gatewayPort,
    });
    client.setID(meter.modbusId);
    client.setTimeout(2500); // Tăng thời gian chờ lên một chút cho an toàn

    // 1. Đọc Số chữ điện (0x00)
    const data0 = await client.readInputRegisters(0, 2);
    const totalEnergy = parseSelecFloat(data0.buffer, 0);

    await delay(50); // Cho Gateway nghỉ 50 mili-giây

    // 2. Đọc Hệ số công suất (0x0C) và Công suất tức thời (0x0E)
    const data1 = await client.readInputRegisters(12, 4);
    const pf = parseSelecFloat(data1.buffer, 0);
    const kw = parseSelecFloat(data1.buffer, 4);

    await delay(50);

    // 3. Đọc Điện áp (0x28)
    const dataV = await client.readInputRegisters(40, 2);
    const voltage = parseSelecFloat(dataV.buffer, 0);

    await delay(50);

    // 4. Đọc Dòng điện (0x2E)
    const dataI = await client.readInputRegisters(46, 2);
    const current = parseSelecFloat(dataI.buffer, 0);

    // Nhân hệ số TU, TI
    const totalKw = kw * (meter.tu * meter.ti);
    const totalCurrent = current * meter.ti;
    const totalVoltage = voltage * meter.tu;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalEnergy: Number(totalEnergy.toFixed(1)),
      voltage: Number(totalVoltage.toFixed(1)),
      current: Number(totalCurrent.toFixed(1)),
      power: Number(totalKw.toFixed(2)),
      pf: Number(pf.toFixed(2)),
    });
  } catch (error: any) {
    console.error(`[Lỗi Live Modbus ID ${meter?.modbusId}]:`, error.message);
    return NextResponse.json(
      { error: "Mất kết nối tới đồng hồ" },
      { status: 503 },
    );
  } finally {
    client.close();
  }
}
