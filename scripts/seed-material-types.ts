import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const materialTypes = [
    { code: "AUS", name: "Bông Úc (Australia)", category: "COTTON" },
    { code: "US_PVC", name: "Bông Mỹ PVC", category: "COTTON" },
    { code: "BRA", name: "Bông Brazil", category: "COTTON" },
    { code: "WEST_AFRICA", name: "Bông Tây Phi", category: "COTTON" },
    { code: "PIMA", name: "Bông Pima", category: "COTTON" },
    { code: "SUPIMA", name: "Bông Supima", category: "COTTON" },
    { code: "CMIA", name: "Bông CMIA", category: "COTTON" },
    { code: "PE_BENMA", name: "PE Benma (Indo)", category: "PE" },
    { code: "PE_THAI", name: "PE Thái Lan", category: "PE" },
    { code: "VISCOSE", name: "Xơ Viscose", category: "VISCOSE" },
  ];

  for (const mt of materialTypes) {
    await prisma.materialType.upsert({
      where: { code: mt.code },
      create: { ...mt, isActive: true },
      update: {},
    });
    console.log(`✓ ${mt.code} - ${mt.name}`);
  }

  console.log("✅ Seed MaterialType hoàn tất!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
