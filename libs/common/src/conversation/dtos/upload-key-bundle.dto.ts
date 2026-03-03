import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Validate Key con
const SignedPreKeySchema = z.object({
  keyId: z.number(),
  publicKey: z.string(),
  signature: z.string(),
});

const OneTimePreKeySchema = z.object({
  keyId: z.number(),
  publicKey: z.string(),
});

// Validate Bundle tổng
export const UploadKeyBundleSchema = z.object({
  deviceId: z.number(),
  registrationId: z.number(),
  identityKey: z.string(),
  signedPreKey: SignedPreKeySchema,
  oneTimePreKeys: z.array(OneTimePreKeySchema),
});

export class UploadKeyBundleDto extends createZodDto(UploadKeyBundleSchema) {}
