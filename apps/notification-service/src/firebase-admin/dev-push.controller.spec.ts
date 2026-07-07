import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { DevPushController } from './dev-push.controller';

describe('DevPushController', () => {
  it('rejects requests without the internal secret', async () => {
    const prisma = {
      pushToken: {
        findFirst: jest.fn(),
      },
    };
    const firebaseAdmin = {
      sendToToken: jest.fn(),
    };
    const controller = new DevPushController(
      prisma as never,
      firebaseAdmin as never,
    );
    const previousInternalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;

    process.env.NOTIFICATION_INTERNAL_SECRET = 'local-notification-secret';

    try {
      await expect(
        controller.sendTest(undefined, {
          title: 'Velora test',
          body: 'Backend Firebase Admin is working.',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.pushToken.findFirst).not.toHaveBeenCalled();
      expect(firebaseAdmin.sendToToken).not.toHaveBeenCalled();
    } finally {
      if (previousInternalSecret === undefined) {
        delete process.env.NOTIFICATION_INTERNAL_SECRET;
      } else {
        process.env.NOTIFICATION_INTERNAL_SECRET = previousInternalSecret;
      }
    }
  });

  it('fails closed when the internal secret is not configured', async () => {
    const prisma = {
      pushToken: {
        findFirst: jest.fn(),
      },
    };
    const firebaseAdmin = {
      sendToToken: jest.fn(),
    };
    const controller = new DevPushController(
      prisma as never,
      firebaseAdmin as never,
    );
    const previousInternalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;

    delete process.env.NOTIFICATION_INTERNAL_SECRET;

    try {
      await expect(
        controller.sendTest('local-notification-secret', {
          title: 'Velora test',
          body: 'Backend Firebase Admin is working.',
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(prisma.pushToken.findFirst).not.toHaveBeenCalled();
      expect(firebaseAdmin.sendToToken).not.toHaveBeenCalled();
    } finally {
      if (previousInternalSecret === undefined) {
        delete process.env.NOTIFICATION_INTERNAL_SECRET;
      } else {
        process.env.NOTIFICATION_INTERNAL_SECRET = previousInternalSecret;
      }
    }
  });
});
