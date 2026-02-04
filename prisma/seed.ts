// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Tạo Admin mặc định
  const passwordHash = await bcrypt.hash('admin123', 10) // Mật khẩu: admin123
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: passwordHash,
      fullName: 'Quản trị viên',
      role: 'ADMIN',
      accessLevel: 'MANAGER',
      isActive: true, // Admin mặc định luôn active
    },
  })
  console.log({ admin })
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })