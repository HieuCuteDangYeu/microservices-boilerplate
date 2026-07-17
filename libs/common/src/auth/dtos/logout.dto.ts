import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LogoutPushTokenSchema = z.object({
  provider: z.enum(['fcm', 'apns_voip']),
  token: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  lifecycleVersion: z.number().int().min(1).max(2_147_483_647).optional(),
});

export const LogoutSchema = z.object({
  // Keep this while older mobile clients still send the original payload.
  pushToken: z.string().min(1).optional(),
  pushTokens: z.array(LogoutPushTokenSchema).min(1).optional(),
});

export class LogoutDto extends createZodDto(LogoutSchema) {}
