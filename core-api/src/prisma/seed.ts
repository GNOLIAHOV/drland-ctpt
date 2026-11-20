/**
 * Seed script: creates (or updates) the first Admin account from env vars.
 * Run with: npx prisma db seed   (or: npm run db:seed)
 *
 * Idempotent — re-running with the same ADMIN_EMAIL updates the password/name
 * instead of failing on the unique constraint.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client.js';

const BCRYPT_ROUNDS = 10;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || 'System Admin';

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const admin = await prisma.admin.upsert({
      where: { email },
      update: { passwordHash, fullName },
      create: { email, passwordHash, fullName },
      select: { id: true, email: true },
    });
    console.log(`✔ Seeded admin: ${admin.email} (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✘ Seed failed:', err);
  process.exit(1);
});
