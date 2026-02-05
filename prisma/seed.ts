import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Đang khởi tạo dữ liệu mẫu...");

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
    data: { name: "Sợi con NM1", factoryId: factory1.id },
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
    data: { name: "Sợi con NM2", factoryId: factory2.id },
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

  await prisma.user.create({
    data: {
      username: "admin",
      password: hashedPassword,
      fullName: "Quản trị viên",
      role: "ADMIN",
      accessLevel: "MANAGER",
      isActive: true, // Kích hoạt luôn
    },
  });

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
