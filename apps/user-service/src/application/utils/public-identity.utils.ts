import { InvalidFullNameError } from '@user/domain/errors/invalid-full-name.error';
import { InvalidUsernameError } from '@user/domain/errors/invalid-username.error';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const FULL_NAME_MAX_LENGTH = 80;

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export function normalizeFullName(fullName: string): string {
  const normalized = fullName.trim().replace(/\s+/g, ' ');

  if (normalized.length < 1 || normalized.length > FULL_NAME_MAX_LENGTH) {
    throw new InvalidFullNameError();
  }

  return normalized;
}

export function normalizeUsername(username: string): string {
  const normalized = username.trim().replace(/^@+/, '').toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new InvalidUsernameError();
  }

  return normalized;
}

export function deriveFullName(email: string): string {
  const localPart = email.split('@')[0] ?? 'user';
  const humanized = localPart
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (!humanized) {
    return 'User';
  }

  return humanized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, FULL_NAME_MAX_LENGTH);
}

export function buildUsernameBase(seed: string): string {
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const candidate = normalized.slice(0, USERNAME_MAX_LENGTH);

  if (candidate.length >= USERNAME_MIN_LENGTH) {
    return candidate;
  }

  return 'user';
}

export function buildUsernameCandidate(
  base: string,
  suffix?: string | number,
): string {
  if (suffix === undefined) {
    return buildUsernameBase(base);
  }

  const suffixText = String(suffix)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const safeSuffix = suffixText || '1';
  const maxBaseLength = USERNAME_MAX_LENGTH - safeSuffix.length - 1;
  const trimmedBase = buildUsernameBase(base).slice(
    0,
    Math.max(USERNAME_MIN_LENGTH, maxBaseLength),
  );

  return `${trimmedBase.slice(0, maxBaseLength)}_${safeSuffix}`;
}
