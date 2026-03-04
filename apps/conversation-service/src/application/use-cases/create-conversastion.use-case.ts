import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { IUserService } from 'apps/conversation-service/src/domain/interfaces/user-service.interface';
import { Conversation } from '../../domain/entities/conversation.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

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
  ): Promise<Conversation> {
    const participantIds = [...new Set(dto.participantIds)];

    if (!participantIds.includes(creatorId)) {
      participantIds.push(creatorId);
    }

    if (participantIds.length < 2) {
      throw new BadRequestException(
        'Conversation must have at least 2 participants',
      );
    }

    const isValidFormat = participantIds.every((id) => {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
      const isUUID =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(
          id,
        );
      return isObjectId || isUUID;
    });
    if (!isValidFormat) throw new BadRequestException('Invalid User ID format');

    const isValid = await this.userService.validateUsers(participantIds);

    if (!isValid) {
      throw new BadRequestException('One or more participants do not exist');
    }

    const isGroup = participantIds.length > 2;

    if (!isGroup) {
      // Nếu chỉ có 2 người, kiểm tra xem đã từng chat chưa
      const existingConv = await this.chatRepository.findPrivateConversation(
        participantIds[0],
        participantIds[1],
      );

      if (existingConv) {
        return existingConv; // Trả về cái cũ, không tạo mới
      }
    }

    const newConversation = new Conversation({
      creatorId: creatorId,
      participantIds: participantIds,
      isGroup: isGroup,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.chatRepository.createConversation(newConversation);
  }
}
