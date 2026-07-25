import 'dotenv/config';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRequiredSystemUserId(name: 'DEFAULT_ADMIN_ID' | 'BOT_USER_ID') {
  const value = process.env[name];

  if (!value || !UUID_V4_PATTERN.test(value)) {
    throw new Error(`${name} must be configured as a UUIDv4.`);
  }

  return value;
}

export const DEFAULT_ADMIN_ID = readRequiredSystemUserId('DEFAULT_ADMIN_ID');
export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
export const DEFAULT_ADMIN_PASSWORD = 'admin123';

export const BOT_USER_ID = readRequiredSystemUserId('BOT_USER_ID');
export const BOT_USER_EMAIL = 'bot@system.local';
