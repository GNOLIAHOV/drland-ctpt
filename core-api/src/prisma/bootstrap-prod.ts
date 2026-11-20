import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client.js';

const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Missing required env var: DATABASE_URL');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  let needInitialSeed = false;

  try {
    const adminCount = await prisma.admin.count();
    if (adminCount === 0) {
      const email = (
        process.env.ADMIN_EMAIL?.trim() || 'admin@drland.vn'
      ).toLowerCase();
      const password = process.env.ADMIN_PASSWORD?.trim() || 'Admin@123';
      const fullName =
        process.env.ADMIN_FULL_NAME?.trim() || 'Quản Lý Hệ Thống';
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await prisma.admin.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash, fullName },
      });
      console.log(`✔ Bootstrapped initial admin account: ${email}`);
    }

    const propertyCount = await prisma.property.count();
    needInitialSeed = propertyCount < 9;
  } finally {
    await prisma.$disconnect();
  }

  if (needInitialSeed) {
    console.log('ℹ Empty database detected — running initial 2-house seed...');
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const seedScript = join(currentDir, 'seed-multi-house.js');
    execFileSync(process.execPath, [seedScript], { stdio: 'inherit' });
  } else {
    console.log('✔ Existing database detected — preserving production data.');
  }
}

main().catch((err: unknown) => {
  console.error('✘ Production bootstrap failed:', err);
  process.exit(1);
});
