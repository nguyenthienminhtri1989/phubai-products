import cron from "node-cron";
import ModbusRTU from "modbus-serial";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

// =========================================================================
// JOB 1: THU THẬP KWH TỪNG GIỜ (Đa Gateway - Tối ưu hóa Kết nối)
// =========================================================================
cron.schedule("0 * * * *", async () => {
  console.log(
    `\n[${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}] Bắt đầu tiến trình thu thập (Đa Gateway)...`,
  );
  try {
    // 1. Lấy tất cả đồng hồ tự động CÓ cấu hình Gateway IP
    const autoMeters = await prisma.powerMeter.findMany({
      where: {
        isActive: true,
        isAuto: true,
        modbusId: { not: null },
        gatewayIp: { not: null },
      },
    });

    if (autoMeters.length === 0) {
      console.log("Chưa có đồng hồ nào được cấu hình đầy đủ thông tin IP.");
      return;
    }

    // 2. Nhóm các đồng hồ theo chung 1 cục Gateway để tối ưu kết nối mạng
    const gateways = {};
    for (const meter of autoMeters) {
      const key = `${meter.gatewayIp}:${meter.gatewayPort}`;
      if (!gateways[key]) gateways[key] = [];
      gateways[key].push(meter);
    }

    // 3. Duyệt qua từng Gateway (Từng Nhà máy)
    for (const [gatewayKey, metersOnGateway] of Object.entries(gateways)) {
      const [ip, portStr] = gatewayKey.split(":");
      const port = parseInt(portStr, 10);

      console.log(`\n--- Đang kết nối tới Gateway [${ip}:${port}] ---`);
      const client = new ModbusRTU();

      try {
        // Chỉ mở TCP 1 lần duy nhất cho toàn bộ đồng hồ thuộc Gateway này
        await client.connectTCP(ip.trim(), { port: port });
        client.setTimeout(2500);

        // Điểm danh đọc số từng đồng hồ
        for (const meter of metersOnGateway) {
          try {
            client.setID(meter.modbusId);
            const data = await client.readInputRegisters(0, 2);
            const rawEnergy = parseSelecFloat(data.buffer, 0);
            const totalEnergy = Number(rawEnergy.toFixed(2));

            // Lưu xuống Database
            await prisma.powerTelemetry.create({
              data: {
                meterId: meter.id,
                totalEnergy: totalEnergy,
              },
            });
            console.log(
              `  + Đồng hồ ${meter.code} (ID: ${meter.modbusId}): ${totalEnergy} kWh`,
            );

            // Nghỉ 50ms giữa các lần hỏi để Gateway không bị nghẽn (Buffer Overflow)
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (meterError) {
            console.error(
              `  - [Lỗi] Đồng hồ ${meter.code} (ID: ${meter.modbusId}): Đọc thất bại (${meterError.message})`,
            );
          }
        }
      } catch (gatewayError) {
        console.error(
          `[Lỗi Mạng] Không thể kết nối tới Gateway ${ip}:${port} - Bỏ qua cụm đồng hồ này! Lỗi: ${gatewayError.message}`,
        );
      } finally {
        client.close(); // Xong việc thì đóng cửa kết nối để giải phóng RAM
      }
    }
    console.log(`\nHoàn tất chu kỳ quét tất cả Gateway!`);
  } catch (error) {
    console.error("Lỗi cấu trúc Job Telemetry:", error);
  }
});

// =========================================================================
// JOB 2: CHỐT SỔ ĐÚNG 8H00 SÁNG HÀNG NGÀY (Chuẩn giờ Việt Nam)
// =========================================================================
cron.schedule(
  "0 8 * * *",
  async () => {
    console.log(
      `\n[${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}] Bắt đầu tiến trình CHỐT SỔ 8H SÁNG...`,
    );

    // VÁ LỖI MÚI GIỜ: Lấy mốc 0h00 của ngày hôm qua theo chuẩn giờ Việt Nam
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }); // Định dạng YYYY-MM-DD
    const yesterday = new Date(`${todayStr}T12:00:00.000+07:00`); // Lấy 12h trưa để tránh lỗi múi giờ
    yesterday.setDate(yesterday.getDate() - 1);

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
          `[Chốt Sổ Thành Công] Đồng hồ ${meter.code}: Tiêu thụ ${consTotal.toFixed(2)} kWh | Thành tiền: ${costTotal.toLocaleString("vi-VN")} VNĐ`,
        );
      }

      // ---------------------------------------------------------------------
      // TỰ ĐỘNG LỌC MÁU (Xóa dữ liệu thô cũ hơn 6 tháng)
      // ---------------------------------------------------------------------
      console.log(
        `[Dọn dẹp] Đang kiểm tra và xóa dữ liệu thô (Telemetry) cũ hơn 6 tháng...`,
      );

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const deletedData = await prisma.powerTelemetry.deleteMany({
        where: {
          timestamp: { lt: sixMonthsAgo },
        },
      });

      if (deletedData.count > 0) {
        console.log(
          `[Hoàn tất dọn dẹp] Đã xóa thành công ${deletedData.count} bản ghi cũ khỏi cơ sở dữ liệu để giải phóng dung lượng.`,
        );
      } else {
        console.log(
          `[Hoàn tất dọn dẹp] Hệ thống sạch sẽ, chưa có dữ liệu nào quá hạn 6 tháng cần xóa.`,
        );
      }
    } catch (error) {
      console.error("Lỗi Job Chốt Sổ & Dọn Dẹp 8h:", error);
    }
  },
  {
    // CẤU HÌNH NODE-CRON CHẠY THEO GIỜ VIỆT NAM
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  },
);

console.log(
  "Tiến trình Energy Cronjob đã khởi động. Đang chờ đến lịch chạy...",
);
