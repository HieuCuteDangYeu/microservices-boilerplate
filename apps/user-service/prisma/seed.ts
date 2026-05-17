import { PrismaClient } from '@prisma/user-client';
import * as bcrypt from 'bcrypt';
import {
  BOT_USER_EMAIL,
  BOT_USER_ID,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_ID,
  DEFAULT_ADMIN_PASSWORD,
} from '../../../libs/common/src/constants/seed.constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding User Service...');

  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN_EMAIL },
    update: {
      fullName: 'Admin User',
      username: 'admin',
      password: hashedPassword,
      isVerified: true,
    },
    create: {
      id: DEFAULT_ADMIN_ID,
      email: DEFAULT_ADMIN_EMAIL,
      fullName: 'Admin User',
      username: 'admin',
      password: hashedPassword,
      isVerified: true,
      createdAt: new Date(),
    },
  });

  console.log(`Admin User created: ${admin.email} (${admin.id})`);

  const bot = await prisma.user.upsert({
    where: { email: BOT_USER_EMAIL },
    update: {
      fullName: 'System Bot',
      username: 'system_bot',
      password: hashedPassword,
      isVerified: true,
    },
    create: {
      id: BOT_USER_ID,
      email: BOT_USER_EMAIL,
      fullName: 'System Bot',
      username: 'system_bot',
      password: hashedPassword,
      isVerified: true,
      createdAt: new Date(),
    },
  });

  console.log(`Bot User created: ${bot.email} (${bot.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
