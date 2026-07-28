import { Injectable } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  IFcmPushGateway,
  SendFcmPushInput,
} from '../../domain/interfaces/fcm-push.gateway.interface';

const ANDROID_MESSAGE_CHANNEL_ID = 'velora_messages';

type FirebaseServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

@Injectable()
export class FirebaseAdminGateway implements IFcmPushGateway {
  private readonly messaging: Messaging;

  constructor() {
    const serviceAccountPath =
      process.env.NOTIFICATION_FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
      throw new Error('Missing NOTIFICATION_FIREBASE_SERVICE_ACCOUNT_PATH');
    }

    const absolutePath = resolve(process.cwd(), serviceAccountPath);
    const serviceAccount = this.readServiceAccount(absolutePath);

    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.projectId,
          });

    this.messaging = getMessaging(app);
  }

  private readServiceAccount(path: string): FirebaseServiceAccount {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid Firebase service account JSON');
    }

    const projectId = this.readString(parsed, 'projectId', 'project_id');
    const clientEmail = this.readString(parsed, 'clientEmail', 'client_email');
    const privateKey = this.readString(parsed, 'privateKey', 'private_key');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Invalid Firebase service account JSON');
    }

    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  private readString(
    value: object,
    camelCaseKey: string,
    snakeCaseKey: string,
  ): string | undefined {
    const record = value as Record<string, unknown>;
    const candidate = record[camelCaseKey] ?? record[snakeCaseKey];

    return typeof candidate === 'string' && candidate.trim()
      ? candidate
      : undefined;
  }

  async send(input: SendFcmPushInput) {
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
        ...(input.apnsBackground
          ? {
              headers: {
                'apns-push-type': 'background',
                'apns-priority': '5',
              },
            }
          : {}),
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
