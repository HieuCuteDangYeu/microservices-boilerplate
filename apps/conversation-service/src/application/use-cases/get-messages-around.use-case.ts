import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnchorMessageWindow,
  IChatRepository,
} from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class GetMessagesAroundUseCase {
  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  async execute(
    conversationId: string,
    userId: string,
    messageId: string,
    before: number,
    after: number,
  ): Promise<AnchorMessageWindow> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not allowed to view messages in this conversation',
      );
    }

    return this.chatRepository.findMessageWindowAroundId(
      conversationId,
      messageId,
      before,
      after,
    );
  }
}
