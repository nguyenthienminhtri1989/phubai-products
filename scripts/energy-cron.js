const cron = require("node-cron");
const ModbusRTU = require("modbus-serial");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Cấu hình mạng của Gateway USR N520
const GATEWAY_IP = "192.168.1.253";
const GATEWAY_PORT = 502;

// THÊM HÀM NÀY: Dùng để đảo Byte (từ CDAB về ABCD) giải mã Float cho đồng hồ Selec
function parseSelecFloat(buffer, offset = 0) {
  // Trích xuất 4 byte từ buffer do Modbus trả về (đang bị ngược là C D A B)
  const byteC = buffer[offset + 0];
  const byteD = buffer[offset + 1];
  const byteA = buffer[offset + 2];
  const byteB = buffer[offset + 3];

  // Xếp lại thành chuẩn A B C D
  const fixedBuffer = Buffer.alloc(4);
  fixedBuffer[0] = byteA;
  fixedBuffer[1] = byteB;
  fixedBuffer[2] = byteC;
  fixedBuffer[3] = byteD;

  // Đọc ra số thực chuẩn
  return fixedBuffer.readFloatBE(0);
}

// Hàm kết nối và đọc Modbus
async function readModbusData(slaveId) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(GATEWAY_IP, { port: GATEWAY_PORT });
    client.setID(slaveId);
    client.setTimeout(2000);

    // Đọc 16 thanh ghi bắt đầu từ 0x00
    const data = await client.readInputRegisters(0, 16);
    const buffer = data.buffer;

    // ---> SỬ DỤNG HÀM GIẢI MÃ VỪA TẠO THAY CHO buffer.readFloatBE()
    // 0x00: byte 0-3 là Active Energy (kWh)
    const totalEnergy = parseSelecFloat(buffer, 0);

    // 0x0E (Decimal 14): 14 * 2 = 28. Byte 28-31 là Total kW
    const activePower = parseSelecFloat(buffer, 28);

    return { totalEnergy, activePower };
  } catch (error) {
    console.error(`[Lỗi Modbus ID ${slaveId}]:`, error.message);
    return null;
  } finally {
    client.close();
  }
}

// =========================================================================
// JOB 1: "VẮT SỮA" MỖI 1 TIẾNG - Lấy dữ liệu thô ném vào PowerTelemetry
// =========================================================================
// Cú pháp: '0 * * * *' nghĩa là chạy vào phút thứ 0 của mỗi giờ (Ví dụ: 7:00, 8:00, 9:00...)
cron.schedule("0 * * * *", async () => {
  console.log(
    `\n[${new Date().toLocaleString()}] Bắt đầu tiến trình thu thập Telemetry (1 tiếng/lần)...`,
  );
  try {
    // 1. Tìm tất cả các đồng hồ đang bật chế độ Tự động
    const autoMeters = await prisma.powerMeter.findMany({
      where: { isActive: true, isAuto: true, modbusId: { not: null } },
    });

    if (autoMeters.length === 0) {
      console.log("Không có đồng hồ tự động nào cần thu thập.");
      return;
    }

    // 2. Đi tuần tự từng đồng hồ để lấy số
    for (const meter of autoMeters) {
      const result = await readModbusData(meter.modbusId);
      if (result) {
        // Lưu vào Database
        await prisma.powerTelemetry.create({
          data: {
            meterId: meter.id,
            totalEnergy: result.totalEnergy,
            activePower: result.activePower,
          },
        });
        console.log(
          `[Thành công] Đồng hồ ${meter.code} (ID: ${meter.id}): ${result.totalEnergy.toFixed(2)} kWh | ${result.activePower.toFixed(2)} kW`,
        );
      }
    }
  } catch (error) {
    console.error("Lỗi Job Telemetry:", error);
  }
});

// =========================================================================
// JOB 2: CHỐT SỔ ĐÚNG 8H00 SÁNG HÀNG NGÀY - Tính tiêu thụ và ghi vào PowerRecord
// =========================================================================
// Cú pháp: '0 8 * * *' nghĩa là chạy đúng lúc 08:00:00 mỗi ngày
cron.schedule("0 8 * * *", async () => {
  console.log(
    `\n[${new Date().toLocaleString()}] Bắt đầu tiến trình CHỐT SỔ 8H SÁNG...`,
  );

  // Ngày chốt sổ là ngày hôm qua (theo logic nghiệp vụ Phú Bài)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  try {
    const autoMeters = await prisma.powerMeter.findMany({
      where: { isActive: true, isAuto: true },
    });

    // Lấy giá điện Bình thường (Hạ thế dùng giá này)
    const priceRecord = await prisma.electricityPrice.findUnique({
      where: { type: "NORMAL" },
    });
    const unitPrice = priceRecord ? priceRecord.price : 0;

    for (const meter of autoMeters) {
      // 1. Tìm bản ghi Telemetry MỚI NHẤT của đồng hồ này (vừa được Job 1 lấy lúc 8h00)
      const latestTelemetry = await prisma.powerTelemetry.findFirst({
        where: { meterId: meter.id },
        orderBy: { timestamp: "desc" },
      });

      if (!latestTelemetry || latestTelemetry.totalEnergy == null) {
        console.log(
          `[Bỏ qua] Đồng hồ ${meter.code} không có dữ liệu Telemetry mới.`,
        );
        continue;
      }

      const currTotal = latestTelemetry.totalEnergy; // CHỈ SỐ MỚI

      // 2. Tìm bản ghi PowerRecord gần nhất trước đó để lấy Chỉ số cũ
      const lastRecord = await prisma.powerRecord.findFirst({
        where: { meterId: meter.id, recordDate: { lt: yesterday } },
        orderBy: { recordDate: "desc" },
      });

      const prevTotal = lastRecord?.currTotal || 0; // CHỈ SỐ CŨ

      // 3. Tính toán Logic (Giống hệt Frontend)
      let isReset = false;
      if (currTotal < prevTotal) isReset = true; // Phát hiện đồng hồ bị thay/reset

      const delta = isReset ? currTotal : Math.max(0, currTotal - prevTotal);
      const multiplier = meter.tu * meter.ti;
      const consTotal = delta * multiplier;
      const costTotal = consTotal * unitPrice;

      // 4. Lưu cứng vào bảng PowerRecord với cờ AUTO
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
        `[Chốt Sổ Thành Công] Đồng hồ ${meter.code}: Tiêu thụ ${consTotal.toFixed(2)} kWh`,
      );
    }
  } catch (error) {
    console.error("Lỗi Job Chốt Sổ 8h:", error);
  }
});

console.log(
  "Tiến trình Energy Cronjob đã khởi động. Đang chờ đến lịch chạy...",
);
