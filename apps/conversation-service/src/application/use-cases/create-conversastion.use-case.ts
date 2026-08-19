import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { IUserService } from 'apps/conversation-service/src/domain/interfaces/user-service.interface';
import { Conversation } from '../../domain/entities/conversation.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import {
  assertValidConversationUserIds,
  normalizeConversationParticipantIds,
  normalizeGroupName,
  normalizeGroupPicture,
  resolveConversationKind,
} from '../policies/conversation-rules';

export type CreateConversationResult = {
  conversation: Conversation;
  created: boolean;
};

@Injectable()
export class CreateConversationUseCase {
  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(
    dto: CreateConversationDto,
    creatorId: string,
  ): Promise<CreateConversationResult> {
    const participantIds = normalizeConversationParticipantIds(
      dto.participantIds,
      creatorId,
    );
    const kind = resolveConversationKind({
      type: dto.type,
      isGroup: dto.isGroup,
    });
    const isGroup = kind === 'GROUP';

    if (participantIds.length < 2) {
      throw new BadRequestException(
        'Conversation must have at least 2 participants',
      );
    }

    if (!isGroup && participantIds.length !== 2) {
      throw new BadRequestException(
        'Direct conversations must have exactly 2 participants',
      );
    }

    if (!isGroup && (dto.name !== undefined || dto.picture !== undefined)) {
      throw new BadRequestException(
        'Group metadata is only supported for group conversations',
      );
    }

    assertValidConversationUserIds(participantIds);

    const isValid = await this.userService.validateUsers(participantIds);
    if (!isValid) {
      throw new BadRequestException('One or more participants do not exist');
    }

    if (!isGroup) {
      const existingConversation =
        await this.chatRepository.findPrivateConversation(
          participantIds[0],
          participantIds[1],
        );

      if (existingConversation) {
        return { conversation: existingConversation, created: false };
      }
    }

    const createdAt = new Date();
    const memberJoinedAt = Object.fromEntries(
      participantIds.map((participantId) => [
        participantId,
        createdAt.toISOString(),
      ]),
    );
    const name = isGroup ? normalizeGroupName(dto.name) : undefined;
    const picture = isGroup ? normalizeGroupPicture(dto.picture) : undefined;

    const newConversation = new Conversation({
      creatorId,
      participantIds,
      isGroup,
      ...(name !== undefined ? { name } : {}),
      ...(picture !== undefined ? { picture } : {}),
      memberJoinedAt,
      createdAt,
      updatedAt: createdAt,
    });

    return {
      conversation:
        await this.chatRepository.createConversation(newConversation),
      created: true,
    };
  }
}
