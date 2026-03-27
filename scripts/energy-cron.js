import cron from "node-cron";
import ModbusRTU from "modbus-serial";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Cấu hình mạng của Gateway USR N520
const GATEWAY_IP = "192.168.1.253";
const GATEWAY_PORT = 502;

// Hàm đảo Byte (từ CDAB về ABCD) giải mã Float chuẩn cho đồng hồ Selec
function parseSelecFloat(buffer, offset = 0) {
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

// Hàm kết nối và đọc Modbus (TỐI ƯU: Chỉ đọc Active Energy)
async function readModbusData(slaveId) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(GATEWAY_IP, { port: GATEWAY_PORT });
    client.setID(slaveId);
    client.setTimeout(2000);

    // TỐI ƯU: Chỉ đọc đúng 2 thanh ghi bắt đầu từ 0x00 (địa chỉ của Active Energy)
    const data = await client.readInputRegisters(0, 2);
    const buffer = data.buffer;

    // Giải mã Float 32-bit (áp dụng hàm đảo Byte ở trên)
    const rawEnergy = parseSelecFloat(buffer, 0);
    // Làm tròn thành 0.02 rồi ép kiểu lại thành số (Number)
    const totalEnergy = Number(rawEnergy.toFixed(2));

    return { totalEnergy };
  } catch (error) {
    console.error(`[Lỗi Modbus ID ${slaveId}]:`, error.message);
    return null;
  } finally {
    client.close();
  }
}

// =========================================================================
// JOB 1: THU THẬP KWH TỪNG GIỜ (Tối ưu)
// =========================================================================
cron.schedule("0 * * * *", async () => {
  console.log(
    `\n[${new Date().toLocaleString()}] Bắt đầu lấy Active Energy (1 tiếng/lần)...`,
  );
  try {
    const autoMeters = await prisma.powerMeter.findMany({
      where: { isActive: true, isAuto: true, modbusId: { not: null } },
    });

    if (autoMeters.length === 0) return;

    for (const meter of autoMeters) {
      const result = await readModbusData(meter.modbusId);
      if (result) {
        // Lưu vào Database (chỉ lưu totalEnergy, bỏ trống activePower)
        await prisma.powerTelemetry.create({
          data: {
            meterId: meter.id,
            totalEnergy: result.totalEnergy,
            activePower: null, // Cố tình để null vì không lấy nữa
          },
        });
        console.log(
          `[Thành công] Đồng hồ ${meter.code}: Điện năng cộng dồn = ${result.totalEnergy.toFixed(2)} kWh`,
        );
      }
    }
  } catch (error) {
    console.error("Lỗi Job Telemetry:", error);
  }
});

// =========================================================================
// JOB 2: CHỐT SỔ ĐÚNG 8H00 SÁNG HÀNG NGÀY (Không thay đổi)
// =========================================================================
cron.schedule("0 8 * * *", async () => {
  console.log(
    `\n[${new Date().toLocaleString()}] Bắt đầu tiến trình CHỐT SỔ 8H SÁNG...`,
  );

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  try {
    const autoMeters = await prisma.powerMeter.findMany({
      where: { isActive: true, isAuto: true },
    });

    const priceRecord = await prisma.electricityPrice.findUnique({
      where: { type: "NORMAL" },
    });
    const unitPrice = priceRecord ? priceRecord.price : 0;

    for (const meter of autoMeters) {
      const latestTelemetry = await prisma.powerTelemetry.findFirst({
        where: { meterId: meter.id },
        orderBy: { timestamp: "desc" },
      });

      if (!latestTelemetry || latestTelemetry.totalEnergy == null) {
        console.log(
          `[Bỏ qua] Đồng hồ ${meter.code} không có dữ liệu Telemetry.`,
        );
        continue;
      }

      const currTotal = latestTelemetry.totalEnergy;

      const lastRecord = await prisma.powerRecord.findFirst({
        where: { meterId: meter.id, recordDate: { lt: yesterday } },
        orderBy: { recordDate: "desc" },
      });

      const prevTotal = lastRecord?.currTotal || 0;

      let isReset = false;
      if (currTotal < prevTotal) isReset = true;

      const delta = isReset ? currTotal : Math.max(0, currTotal - prevTotal);
      const multiplier = meter.tu * meter.ti;
      const consTotal = delta * multiplier;
      const costTotal = consTotal * unitPrice;

      await prisma.powerRecord.upsert({
        where: {
          recordDate_meterId: { recordDate: yesterday, meterId: meter.id },
        },
        update: {
          dataSource: "AUTO",
          isReset,
          prevTotal,
          currTotal,
          consTotal,
          costTotal,
        },
        create: {
          recordDate: yesterday,
          meterId: meter.id,
          dataSource: "AUTO",
          isReset,
          prevTotal,
          currTotal,
          consTotal,
          costTotal,
        },
      });
      console.log(
        `[Chốt Sổ Thành Công] Đồng hồ ${meter.code}: Tiêu thụ ${consTotal.toFixed(2)} kWh | Thành tiền: ${costTotal.toLocaleString()} VNĐ`,
      );
    }
  } catch (error) {
    console.error("Lỗi Job Chốt Sổ 8h:", error);
  }
});

console.log(
  "Tiến trình Energy Cronjob đã khởi động. Đang chờ đến lịch chạy...",
);
