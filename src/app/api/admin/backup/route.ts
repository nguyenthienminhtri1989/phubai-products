import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Xử lý BigInt (bảng power_telemetries dùng BigInt ID) khi serialize sang JSON
function serializeBigInt(data: unknown): string {
  return JSON.stringify(data, (_, v) =>
    typeof v === "bigint" ? Number(v) : v
  );
}

// 1. BACKUP: Tải dữ liệu về
export async function GET() {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin mới được backup" },
        { status: 403 },
      );
    }

    // Lấy dữ liệu song song từ TẤT CẢ các bảng trong schema
    const [
      factories,
      processes,
      items,
      machines,
      users,
      userProcesses,
      maintenanceTasks,
      maintenanceHistories,
      productionLogs,
      productionLines,
      productionLineLinks,
      stopCategories,
      machineStopLogs,
      electricityPrices,
      meterGroupCategories,
      substations,
      powerMeters,
      powerRecords,
      powerTelemetries,
      shiftCategories,
      energyTypeCategories,
      iotSources,
      iotMachineMaps,
      iotItemMaps,
      iotImportLogs,
    ] = await Promise.all([
      prisma.factory.findMany(),
      prisma.process.findMany(),
      prisma.item.findMany(),
      prisma.machine.findMany(),
      prisma.user.findMany(),
      prisma.userProcess.findMany(),
      prisma.maintenanceTask.findMany(),
      prisma.maintenanceHistory.findMany(),
      prisma.productionLog.findMany(),
      prisma.productionLine.findMany(),
      prisma.productionLineLink.findMany(),
      prisma.stopCategory.findMany(),
      prisma.machineStopLog.findMany(),
      prisma.electricityPrice.findMany(),
      prisma.meterGroupCategory.findMany(),
      prisma.substation.findMany(),
      prisma.powerMeter.findMany(),
      prisma.powerRecord.findMany(),
      prisma.powerTelemetry.findMany(),
      prisma.shiftCategory.findMany(),
      prisma.energyTypeCategory.findMany(),
      prisma.iotSource.findMany(),
      prisma.iotMachineMap.findMany(),
      prisma.iotItemMap.findMany(),
      prisma.iotImportLog.findMany(),
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "2.0",
      data: {
        factories,
        processes,
        items,
        machines,
        users,
        userProcesses,
        maintenanceTasks,
        maintenanceHistories,
        productionLogs,
        productionLines,
        productionLineLinks,
        stopCategories,
        machineStopLogs,
        electricityPrices,
        meterGroupCategories,
        substations,
        powerMeters,
        powerRecords,
        powerTelemetries,
        shiftCategories,
        energyTypeCategories,
        iotSources,
        iotMachineMaps,
        iotItemMaps,
        iotImportLogs,
      },
    };

    // Dùng custom serializer thay vì NextResponse.json() để tránh lỗi BigInt
    return new Response(serializeBigInt(backupData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Backup Error:", error);
    return NextResponse.json({ error: "Lỗi khi tạo backup" }, { status: 500 });
  }
}

// 2. RESTORE: Khôi phục dữ liệu từ file
export async function POST(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin mới được restore" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      factories,
      processes,
      items,
      machines,
      users,
      userProcesses,
      maintenanceTasks,
      maintenanceHistories,
      productionLogs,
      productionLines,
      productionLineLinks,
      stopCategories,
      machineStopLogs,
      electricityPrices,
      meterGroupCategories,
      substations,
      powerMeters,
      powerRecords,
      powerTelemetries,
      shiftCategories,
      energyTypeCategories,
      iotSources,
      iotMachineMaps,
      iotItemMaps,
      iotImportLogs,
    } = body.data;

    await prisma.$transaction(
      async (tx) => {
        // BƯỚC 1: Vô hiệu hóa kiểm tra khóa ngoại tạm thời
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL DEFERRED;`);

        // BƯỚC 2: Xóa sạch dữ liệu cũ - thứ tự: bảng con trước, bảng cha sau
        // Lưu ý: MaintenanceHistory không có @@map nên tên bảng giữ nguyên PascalCase
        const tables = [
          "MaintenanceHistory",    // con của maintenance_tasks
          "iot_import_logs",       // con của iot_sources
          "iot_item_maps",         // con của iot_sources, items
          "iot_machine_maps",      // con của iot_sources, machines
          "machine_stop_logs",     // con của machines, stop_categories, users
          "power_telemetries",     // con của power_meters
          "power_records",         // con của power_meters
          "production_line_links", // con của production_lines, machines
          "production_lines",      // con của items, factories, users
          "maintenance_tasks",     // con của machines
          "user_processes",        // con của users, processes
          "production_logs",       // con của machines, items, users
          "machines",
          "power_meters",
          "substations",
          "iot_sources",
          "meter_group_categories",
          "stop_categories",
          "electricity_prices",
          "shift_categories",
          "energy_type_categories",
          "users",
          "items",
          "processes",
          "factories",
        ];

        for (const table of tables) {
          await tx.$executeRawUnsafe(
            `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`,
          );
        }

        // BƯỚC 3: Nạp dữ liệu theo thứ tự phụ thuộc khóa ngoại (cha trước, con sau)

        // === CẤP 1: Bảng gốc (không phụ thuộc bảng nào) ===
        if (factories?.length > 0)
          await tx.factory.createMany({ data: factories });

        if (items?.length > 0)
          await tx.item.createMany({
            data: items.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (users?.length > 0)
          await tx.user.createMany({
            data: users.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
            })),
          });

        if (meterGroupCategories?.length > 0)
          await tx.meterGroupCategory.createMany({
            data: meterGroupCategories.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (stopCategories?.length > 0)
          await tx.stopCategory.createMany({
            data: stopCategories.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
            })),
          });

        if (electricityPrices?.length > 0)
          await tx.electricityPrice.createMany({
            data: electricityPrices.map((r: any) => ({
              ...r,
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (shiftCategories?.length > 0)
          await tx.shiftCategory.createMany({
            data: shiftCategories.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (energyTypeCategories?.length > 0)
          await tx.energyTypeCategory.createMany({
            data: energyTypeCategories.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (iotSources?.length > 0)
          await tx.iotSource.createMany({
            data: iotSources.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        // === CẤP 2: Phụ thuộc factories ===
        if (processes?.length > 0)
          await tx.process.createMany({ data: processes });

        if (substations?.length > 0)
          await tx.substation.createMany({ data: substations });

        // === CẤP 3: Phụ thuộc processes / substations / meterGroupCategories ===
        if (machines?.length > 0)
          await tx.machine.createMany({ data: machines });

        if (powerMeters?.length > 0)
          await tx.powerMeter.createMany({ data: powerMeters });

        // === CẤP 4: Phụ thuộc machines / users+processes ===
        if (userProcesses?.length > 0)
          await tx.userProcess.createMany({ data: userProcesses });

        if (maintenanceTasks?.length > 0)
          await tx.maintenanceTask.createMany({
            data: maintenanceTasks.map((r: any) => ({
              ...r,
              lastPerformedDate: r.lastPerformedDate
                ? new Date(r.lastPerformedDate)
                : null,
              nextDueDate: new Date(r.nextDueDate),
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        // === CẤP 5: Phụ thuộc maintenance_tasks ===
        if (maintenanceHistories?.length > 0)
          await tx.maintenanceHistory.createMany({
            data: maintenanceHistories.map((r: any) => ({
              ...r,
              performedDate: new Date(r.performedDate),
            })),
          });

        // === Nhật ký sản xuất (batched - có thể lớn) ===
        if (productionLogs?.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < productionLogs.length; i += batchSize) {
            await tx.productionLog.createMany({
              data: productionLogs
                .slice(i, i + batchSize)
                .map((log: any) => ({
                  ...log,
                  recordDate: log.recordDate ? new Date(log.recordDate) : null,
                  createdAt: log.createdAt ? new Date(log.createdAt) : undefined,
                  updatedAt: log.updatedAt ? new Date(log.updatedAt) : undefined,
                })),
            });
          }
        }

        if (productionLines?.length > 0)
          await tx.productionLine.createMany({
            data: productionLines.map((r: any) => ({
              ...r,
              startDate: new Date(r.startDate),
              endDate: r.endDate ? new Date(r.endDate) : null,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        if (productionLineLinks?.length > 0)
          await tx.productionLineLink.createMany({ data: productionLineLinks });

        if (machineStopLogs?.length > 0)
          await tx.machineStopLog.createMany({
            data: machineStopLogs.map((r: any) => ({
              ...r,
              startTime: new Date(r.startTime),
              endTime: r.endTime ? new Date(r.endTime) : null,
              recordDate: new Date(r.recordDate),
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            })),
          });

        // === Dữ liệu điện năng (batched - có thể lớn) ===
        if (powerRecords?.length > 0) {
          const batchSize = 500;
          for (let i = 0; i < powerRecords.length; i += batchSize) {
            await tx.powerRecord.createMany({
              data: powerRecords.slice(i, i + batchSize).map((r: any) => ({
                ...r,
                recordDate: new Date(r.recordDate),
                createdAt: new Date(r.createdAt),
                updatedAt: new Date(r.updatedAt),
              })),
            });
          }
        }

        // Telemetry IoT: dùng BigInt cho ID (đã serialize thành Number khi backup)
        if (powerTelemetries?.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < powerTelemetries.length; i += batchSize) {
            await tx.powerTelemetry.createMany({
              data: powerTelemetries
                .slice(i, i + batchSize)
                .map((r: any) => ({
                  ...r,
                  id: BigInt(r.id),
                  timestamp: new Date(r.timestamp),
                })),
            });
          }
        }

        // === Mapping IoT ===
        if (iotMachineMaps?.length > 0)
          await tx.iotMachineMap.createMany({
            data: iotMachineMaps.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
            })),
          });

        if (iotItemMaps?.length > 0)
          await tx.iotItemMap.createMany({
            data: iotItemMaps.map((r: any) => ({
              ...r,
              createdAt: new Date(r.createdAt),
            })),
          });

        if (iotImportLogs?.length > 0)
          await tx.iotImportLog.createMany({
            data: iotImportLogs.map((r: any) => ({
              ...r,
              importedAt: new Date(r.importedAt),
            })),
          });
      },
      {
        timeout: 120000, // 2 phút cho dataset lớn (điện năng, telemetry)
      },
    );

    return NextResponse.json({ message: "Khôi phục dữ liệu thành công!" });
  } catch (error: any) {
    console.error("Restore Error:", error);
    return NextResponse.json(
      {
        error:
          error.message ||
          "Lỗi khôi phục dữ liệu (Có thể do sai cấu trúc file)",
      },
      { status: 500 },
    );
  }
}
