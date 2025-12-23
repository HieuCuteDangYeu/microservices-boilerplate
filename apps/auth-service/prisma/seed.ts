import { PrismaClient } from '@prisma/auth-client';
import { DEFAULT_ADMIN_ID } from '../../../libs/common/src/constants/seed.constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Auth Service...');

  await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: { name: 'USER' },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  console.log('Roles initialized: USER, ADMIN');

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: DEFAULT_ADMIN_ID,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: DEFAULT_ADMIN_ID,
      roleId: adminRole.id,
    },
  });

  console.log(`Assigned ADMIN role to user ${DEFAULT_ADMIN_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
