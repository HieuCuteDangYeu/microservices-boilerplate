import { BadRequestException } from '@nestjs/common';

export type ConversationKind = 'DIRECT' | 'GROUP';

export type ConversationKindInput = {
  type?: ConversationKind;
  isGroup?: boolean;
};

export const normalizeConversationParticipantIds = (
  participantIds: string[],
  creatorId: string,
): string[] => {
  const normalized = participantIds
    .filter((participantId): participantId is string =>
      typeof participantId === 'string',
    )
    .map((participantId) => participantId.trim())
    .filter(Boolean);

  if (creatorId.trim()) {
    normalized.push(creatorId.trim());
  }

  return [...new Set(normalized)];
};

export const assertValidConversationUserId = (userId: string): void => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
  const isUUID =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(
      userId,
    );

  if (!isObjectId && !isUUID) {
    throw new BadRequestException('Invalid User ID format');
  }
};

export const assertValidConversationUserIds = (userIds: string[]): void => {
  userIds.forEach(assertValidConversationUserId);
};

export const resolveConversationKind = (
  input: ConversationKindInput,
): ConversationKind => {
  const kindFromType = input.type;
  const kindFromLegacyFlag =
    typeof input.isGroup === 'boolean'
      ? input.isGroup
        ? 'GROUP'
        : 'DIRECT'
      : undefined;

  if (
    kindFromType !== undefined &&
    kindFromLegacyFlag !== undefined &&
    kindFromType !== kindFromLegacyFlag
  ) {
    throw new BadRequestException(
      'type and isGroup must describe the same conversation kind',
    );
  }

  return kindFromType ?? kindFromLegacyFlag ?? 'DIRECT';
};

export const normalizeGroupName = (value?: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException('Group name cannot be empty');
  }

  if (normalized.length > 100) {
    throw new BadRequestException('Group name cannot exceed 100 characters');
  }

  return normalized;
};

export const normalizeGroupPicture = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException('Group picture cannot be empty');
  }

  if (normalized.length > 2048) {
    throw new BadRequestException('Group picture is too long');
  }

  return normalized;
};
