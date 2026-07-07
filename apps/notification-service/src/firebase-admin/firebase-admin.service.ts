import { Injectable } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SendToTokenInput = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

@Injectable()
export class FirebaseAdminService {
  private readonly messaging: Messaging;

  constructor() {
    const serviceAccountPath =
      process.env.NOTIFICATION_FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
      throw new Error('Missing NOTIFICATION_FIREBASE_SERVICE_ACCOUNT_PATH');
    }

    const absolutePath = resolve(process.cwd(), serviceAccountPath);
    const serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf8'));

    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id,
          });

    this.messaging = getMessaging(app);
  }

  async sendToToken(input: SendToTokenInput) {
    const data = Object.fromEntries(
      Object.entries(input.data ?? {})
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );

    return this.messaging.send({
      token: input.token,
      notification: {
        title: input.title,
        body: input.body,
      },
      data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
  }
}
