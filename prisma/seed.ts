import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Đang khởi tạo dữ liệu mẫu...");

  // Chỉ seed khi chưa có dữ liệu (tránh tạo duplicate khi chạy lại)
  const existingFactories = await prisma.factory.count();
  if (existingFactories > 0) {
    console.log("⏭️  Đã có dữ liệu, bỏ qua seed để tránh duplicate.");
    return;
  }

  // 1. TẠO NHÀ MÁY
  const factory1 = await prisma.factory.create({
    data: { name: "Nhà máy Sợi 1" },
  });
  const factory2 = await prisma.factory.create({
    data: { name: "Nhà máy Sợi 2" },
  });
  const factory3 = await prisma.factory.create({
    data: { name: "Nhà máy Sợi 3" },
  });

  // 2. TẠO CÔNG ĐOẠN
  // Nhà máy 1
  const procBongChai1 = await prisma.process.create({
    data: { name: "Bông Chải NM12", factoryId: factory1.id },
  });
  const proGhepTho1 = await prisma.process.create({
    data: { name: "Ghép Thô NM1", factoryId: factory1.id },
  });
  const proSoiCon1 = await prisma.process.create({
    data: { name: "Sợi con NM1", factoryId: factory1.id, revenueFactoryId: factory1.id },
  });
  const proDanhOng1 = await prisma.process.create({
    data: { name: "Đánh ống NM1", factoryId: factory1.id },
  });
  const proDauXe = await prisma.process.create({
    data: { name: "Đậu Xe", factoryId: factory1.id },
  });
  // Nhà máy 2
  const proGhepTho2 = await prisma.process.create({
    data: { name: "Ghép Thô NM2", factoryId: factory2.id },
  });
  const proSoiCon2 = await prisma.process.create({
    data: { name: "Sợi con NM2", factoryId: factory2.id, revenueFactoryId: factory1.id },
  });
  await prisma.process.create({
    data: { name: "Sợi con G37", factoryId: factory2.id, revenueFactoryId: factory2.id },
  });
  const proDanhOng2 = await prisma.process.create({
    data: { name: "Đánh ống NM2", factoryId: factory2.id },
  });
  const proChaiKy2 = await prisma.process.create({
    data: { name: "Cuộn cúi - Chải kỹ NM2", factoryId: factory2.id },
  });
  // Nhà máy 3
  const procBongChai3 = await prisma.process.create({
    data: { name: "Bông Chải NM3", factoryId: factory3.id },
  });
  const proGhepTho3 = await prisma.process.create({
    data: { name: "Ghép Thô NM3", factoryId: factory3.id },
  });
  const proSoiCon3 = await prisma.process.create({
    data: { name: "Sợi con NM3", factoryId: factory3.id },
  });
  const proDanhOng3 = await prisma.process.create({
    data: { name: "Đánh ống NM3", factoryId: factory3.id },
  });
  const proChaiKy3 = await prisma.process.create({
    data: { name: "Cuộn cúi - Chải kỹ NM3", factoryId: factory3.id },
  });

  // // 3. TẠO MẶT HÀNG (ITEMS)
  // const itemCVC = await prisma.item.create({
  //   data: { name: 'CVC 30', code: 'CVC30', ne: 30 },
  // })
  // const itemTC = await prisma.item.create({
  //   data: { name: 'TC 40', code: 'TC40', ne: 40 },
  // })

  // // 4. TẠO MÁY MÓC (MACHINES)
  // // Máy Thô (Loại 1 - Sản lượng trực tiếp)
  // await prisma.machine.create({
  //   data: {
  //     name: 'Máy Thô 01',
  //     processId: proctho.id,
  //     formulaType: 1,
  //     isActive: true,
  //     currentNE: 0,
  //     currentItemId: itemCVC.id // Gán luôn mặt hàng đang chạy
  //   },
  // })

  // // Máy Ống (Loại 2 - Trừ lùi)
  // await prisma.machine.create({
  //   data: {
  //     name: 'Máy Ống 01',
  //     processId: procOng.id,
  //     formulaType: 2,
  //     isActive: true,
  //     currentNE: 30,
  //     currentItemId: itemCVC.id
  //   },
  // })

  // // Máy Sợi Con (Loại 3 - Công thức phức tạp)
  // await prisma.machine.create({
  //   data: {
  //     name: 'Máy Sợi 01',
  //     processId: procSoiCon.id,
  //     formulaType: 3,
  //     isActive: true,
  //     spindleCount: 480, // 480 cọc
  //     currentNE: 30,
  //     currentItemId: itemCVC.id
  //   },
  // })

  // 5. TẠO TÀI KHOẢN ADMIN (Quan trọng nhất)
  const hashedPassword = await bcrypt.hash("150489", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      fullName: "Quản trị viên",
      userRole: "ADMIN",
      isActive: true,
    },
  });

  // 6. TẠO DANH MỤC NGUYÊN NHÂN DỪNG MÁY (StopCategory)
  const stopCategories = [
    { name: "Hỏng máy",           color: "#ff4d4f" },
    { name: "Bảo dưỡng định kỳ",  color: "#faad14" },
    { name: "Thiếu nguyên liệu",  color: "#fa8c16" },
    { name: "Sự cố điện",         color: "#f5222d" },
    { name: "Thay đổi mặt hàng",  color: "#1677ff" },
    { name: "Lỗi chất lượng",     color: "#722ed1" },
    { name: "Thiếu nhân sự",      color: "#eb2f96" },
    { name: "Khác",               color: "#8c8c8c" },
  ];

  for (const cat of stopCategories) {
    const existing = await prisma.stopCategory.findFirst({ where: { name: cat.name } });
    if (!existing) {
      await prisma.stopCategory.create({
        data: { name: cat.name, color: cat.color, isDefault: true, isActive: true },
      });
    }
  }

  console.log("✅ Đã tạo xong dữ liệu mẫu!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
