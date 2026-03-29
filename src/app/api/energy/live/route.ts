import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ModbusRTU from "modbus-serial";

// Hàm đảo Byte kinh điển của đồng hồ Selec (CDAB -> ABCD)
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const meterId = searchParams.get("meterId");

  if (!meterId) {
    return NextResponse.json({ error: "Thiếu ID đồng hồ" }, { status: 400 });
  }

  // 1. Lấy cấu hình IP, Port, Slave ID từ Database
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
    // 2. Kết nối thẳng tới Gateway dưới xưởng
    await client.connectTCP(meter.gatewayIp, { port: meter.gatewayPort });
    client.setID(meter.modbusId);
    client.setTimeout(1500); // Ép timeout ngắn (1.5s) để web không bị treo

    // 3. Đọc Block 1: Hệ số công suất (PF - 0x0C) và Công suất tức thời (kW - 0x0E)
    // Bắt đầu từ 12 (0x0C), đọc 4 thanh ghi (8 bytes)
    const data1 = await client.readInputRegisters(12, 4);
    const pf = parseSelecFloat(data1.buffer, 0);
    const kw = parseSelecFloat(data1.buffer, 4);

    // 4. Đọc Block 2: Điện áp trung bình (V - 0x28) và Dòng điện trung bình (A - 0x2E)
    // Bắt đầu từ 40 (0x28), đọc 8 thanh ghi (16 bytes)
    const data2 = await client.readInputRegisters(40, 8);
    const voltage = parseSelecFloat(data2.buffer, 0);
    const current = parseSelecFloat(data2.buffer, 12); // Offset 12 bytes

    // 5. Tính toán nhân với hệ số Biến dòng (TI) và Biến áp (TU)
    const totalKw = kw * (meter.tu * meter.ti);
    const totalCurrent = current * meter.ti;
    const totalVoltage = voltage * meter.tu;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      voltage: Number(totalVoltage.toFixed(1)),
      current: Number(totalCurrent.toFixed(1)),
      power: Number(totalKw.toFixed(2)),
      pf: Number(pf.toFixed(2)),
    });
  } catch (error: any) {
    console.error(`[Lỗi Live Modbus ID ${meter.modbusId}]:`, error.message);
    return NextResponse.json(
      { error: "Mất kết nối tới đồng hồ" },
      { status: 503 },
    );
  } finally {
    // 6. LUÔN LUÔN đóng kết nối để Gateway không bị tràn bộ nhớ (Buffer Overflow)
    client.close();
  }
}
