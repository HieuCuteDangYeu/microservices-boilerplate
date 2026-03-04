import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { Inject, Injectable } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity'; // Import Conversation
import { Message } from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  // 👇 Update kiểu trả về: Cả Message và Conversation
  async execute(
    dto: CreateMessageDto,
    senderId: string,
  ): Promise<{ message: Message; conversation: Conversation }> {
    // 1. Tạo tin nhắn (Repository đã tự update lastMessage trong DB rồi)
    const newMessage = new Message({
      id: '',
      conversationId: dto.conversationId,
      senderId: senderId,
      content: dto.content,
      signalType: dto.signalType,
      type: dto.type,
      createdAt: new Date(),
    });

    const savedMessage = await this.chatRepository.createMessage(newMessage);

    // 2. 👇 QUAN TRỌNG: Lấy lại Conversation mới nhất (để có lastMessage và participantIds)
    const updatedConversation = await this.chatRepository.findConversation(
      dto.conversationId,
    );

    if (!updatedConversation) {
      throw new Error('Conversation not found after creating message');
    }

    // 3. Trả về cả hai

    return {
      message: savedMessage,
      conversation: updatedConversation,
    };
  }
}
