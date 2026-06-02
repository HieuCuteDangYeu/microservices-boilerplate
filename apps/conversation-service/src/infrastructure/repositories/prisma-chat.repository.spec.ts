import { BadRequestException } from '@nestjs/common';
import { MessageSchema } from '@common/conversation/dtos/message.dto';

import { Message } from '../../domain/entities/message.entity';
import { ChatMapper } from './chat.mapper';
import { PrismaChatRepository } from './prisma-chat.repository';

import type { MessageReplyPreview } from '../../domain/entities/message.entity';

type ReplyPreviewHarness = {
  buildReplyPreview: (
    replyToId: string | undefined,
    conversationId: string,
  ) => Promise<MessageReplyPreview | undefined>;
  normalizeReplyPreview: (value: unknown) => MessageReplyPreview | undefined;
};

const createRepositoryHarness = ({
  replyTarget,
}: {
  replyTarget?: Record<string, unknown> | null;
}) => {
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(replyTarget ?? null),
    },
  };
  const redis = {
    del: jest.fn(),
    expire: jest.fn(),
    get: jest.fn(),
    hset: jest.fn(),
    pipeline: jest.fn(),
  };
  const encryptionRepository = {
    decrypt: jest.fn((value: string) => value),
    encrypt: jest.fn((value: string) => value),
  };
  const userService = {
    findUsersByIds: jest.fn().mockResolvedValue([
      {
        id: 'sender-1',
        email: 'sender@example.com',
        name: 'Sender Name',
      },
    ]),
  };

  return {
    prisma,
    repository: new PrismaChatRepository(
      prisma as never,
      redis as never,
      encryptionRepository,
      userService as never,
    ) as unknown as ReplyPreviewHarness,
  };
};

describe('PrismaChatRepository reply previews', () => {
  it('includes image thumbnail and dimensions when replying to an image', async () => {
    const { repository } = createRepositoryHarness({
      replyTarget: {
        id: 'image-message',
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: '[Hinh anh]',
        type: 'image',
        signalType: 0,
        isRecalled: false,
        media: {
          fileUrl: 'https://cdn.velora.test/chat/image.jpg',
          width: 1200,
          height: 900,
        },
      },
    });

    await expect(
      repository.buildReplyPreview('image-message', 'conversation-1'),
    ).resolves.toEqual({
      senderName: 'Sender Name',
      content: '[Hình ảnh]',
      thumbnailUri: 'https://cdn.velora.test/chat/image.jpg',
      mediaWidth: 1200,
      mediaHeight: 900,
      type: 'image',
    });
  });

  it('includes video thumbnail and dimensions when replying to a video with a thumbnail', async () => {
    const { repository } = createRepositoryHarness({
      replyTarget: {
        id: 'video-message',
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: '[Video]',
        type: 'video',
        signalType: 0,
        isRecalled: false,
        media: {
          fileUrl: 'https://cdn.velora.test/chat/video.mp4',
          thumbnailUrl: 'https://cdn.velora.test/chat/video-thumb.jpg',
          width: 1080,
          height: 1920,
        },
      },
    });

    await expect(
      repository.buildReplyPreview('video-message', 'conversation-1'),
    ).resolves.toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });

  it('does not use the video file URL as thumbnailUri when a video thumbnail is missing', async () => {
    const { repository } = createRepositoryHarness({
      replyTarget: {
        id: 'video-message',
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: '[Video]',
        type: 'video',
        signalType: 0,
        isRecalled: false,
        media: {
          fileUrl: 'https://cdn.velora.test/chat/video.mp4',
          width: 1080,
          height: 1920,
        },
      },
    });

    await expect(
      repository.buildReplyPreview('video-message', 'conversation-1'),
    ).resolves.toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });

  it('rejects reply targets from another conversation', async () => {
    const { repository } = createRepositoryHarness({
      replyTarget: {
        id: 'image-message',
        conversationId: 'other-conversation',
        senderId: 'sender-1',
        content: '[Hinh anh]',
        type: 'image',
        signalType: 0,
        isRecalled: false,
      },
    });

    await expect(
      repository.buildReplyPreview('image-message', 'conversation-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('normalizes stored reply previews without dropping media metadata', () => {
    const { repository } = createRepositoryHarness({});

    expect(
      repository.normalizeReplyPreview({
        senderName: 'Sender Name',
        content: '[Video]',
        thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
        mediaWidth: 1080,
        mediaHeight: 1920,
        type: 'video',
      }),
    ).toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });
});

describe('ChatMapper reply previews', () => {
  it('preserves media metadata from persisted reply previews', () => {
    const message = ChatMapper.toDomain({
      id: 'reply-message',
      conversationId: 'conversation-1',
      senderId: 'sender-2',
      clientMessageId: null,
      content: 'Nice video',
      type: 'text',
      signalType: 0,
      media: null,
      registrationId: null,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      isRecalled: false,
      recalledAt: null,
      replyToId: 'video-message',
      replyPreview: {
        senderName: 'Sender Name',
        content: '[Video]',
        thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
        mediaWidth: 1080,
        mediaHeight: 1920,
        type: 'video',
      },
      readBy: [],
      reactions: null,
    });

    expect(message.replyPreview).toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });

  it('returns reply preview metadata in outgoing DTOs', () => {
    const message = new Message({
      id: 'reply-message',
      conversationId: 'conversation-1',
      senderId: 'sender-2',
      content: 'Nice video',
      type: 'text',
      signalType: 0,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      replyToId: 'video-message',
      replyPreview: {
        senderName: 'Sender Name',
        content: '[Video]',
        thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
        mediaWidth: 1080,
        mediaHeight: 1920,
        type: 'video',
      },
      readBy: [],
    });

    expect(ChatMapper.toDto(message).replyPreview).toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });
});

describe('MessageDto reply previews', () => {
  it('accepts reply preview media metadata in outgoing message payloads', () => {
    expect(
      MessageSchema.parse({
        id: 'reply-message',
        conversationId: 'conversation-1',
        senderId: 'sender-2',
        clientMessageId: 'client-message-1',
        content: 'Nice video',
        type: 'text',
        signalType: 0,
        createdAt: '2026-06-02T00:00:00.000Z',
        replyToId: 'video-message',
        replyPreview: {
          senderName: 'Sender Name',
          content: '[Video]',
          thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
          mediaWidth: 1080,
          mediaHeight: 1920,
          type: 'video',
        },
        createdAtMs: 1780358400000,
        readBy: [],
      }).replyPreview,
    ).toEqual({
      senderName: 'Sender Name',
      content: '[Video]',
      thumbnailUri: 'https://cdn.velora.test/chat/video-thumb.jpg',
      mediaWidth: 1080,
      mediaHeight: 1920,
      type: 'video',
    });
  });
});
