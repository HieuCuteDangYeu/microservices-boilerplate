import { PrismaClient } from '@prisma/user-client';
import * as bcrypt from 'bcrypt';
import {
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
    update: {},
    create: {
      id: DEFAULT_ADMIN_ID,
      email: DEFAULT_ADMIN_EMAIL,
      password: hashedPassword,
      createdAt: new Date(),
    },
  });

  console.log(`Admin User created: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
