import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class GetConversationUseCase {
  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  async execute(conversationId: string, userId: string): Promise<Conversation> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // 👇 LOGIC BẢO MẬT: Check xem user có trong nhóm không
    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    return conversation;
  }
}
