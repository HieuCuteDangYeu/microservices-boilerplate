import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class GetMessagesUseCase {
  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  async execute(
    conversationId: string,
    userId: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<Message[]> {
    // 1. Lấy thông tin cuộc trò chuyện để check quyền trước
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // 2. 👇 Check quyền: Có phải thành viên không?
    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not allowed to view messages in this conversation',
      );
    }

    // 3. Nếu OK thì mới đi lấy tin nhắn
    // (Ở đây bạn có thể thêm logic pagination limit/offset sau này)
    return this.chatRepository.findMessagesByConversationId(
      conversationId,
      limit,
      cursor,
    );
  }
}
