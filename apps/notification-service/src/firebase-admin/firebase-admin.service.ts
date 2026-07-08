import { Injectable } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ANDROID_MESSAGE_CHANNEL_ID = 'velora_messages';

type SendToTokenInput = {
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  androidChannelId?: string;
  androidSound?: string;
  includeNotification?: boolean;
  apnsContentAvailable?: boolean;
  apnsSound?: string;
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

    const shouldIncludeNotification =
      input.includeNotification !== false &&
      Boolean(input.title?.trim()) &&
      Boolean(input.body?.trim());

    return this.messaging.send({
      token: input.token,
      ...(shouldIncludeNotification
        ? {
            notification: {
              title: input.title,
              body: input.body,
            },
          }
        : {}),
      data,
      android: {
        priority: 'high',
        ...(shouldIncludeNotification
          ? {
              notification: {
                channelId: input.androidChannelId ?? ANDROID_MESSAGE_CHANNEL_ID,
                priority: 'max',
                sound: input.androidSound ?? 'default',
              },
            }
          : {}),
      },
      apns: {
        payload: {
          aps: {
            ...(input.apnsContentAvailable ? { 'content-available': 1 } : {}),
            ...(shouldIncludeNotification || input.apnsSound
              ? { sound: input.apnsSound ?? 'default' }
              : {}),
          },
        },
      },
    });
  }
}
