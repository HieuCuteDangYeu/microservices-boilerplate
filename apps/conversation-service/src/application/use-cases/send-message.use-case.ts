import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  async execute(dto: CreateMessageDto, senderId: string): Promise<Message> {
    const newMessage = new Message({
      id: '',
      conversationId: dto.conversationId,
      senderId,
      clientMessageId: dto.clientMessageId,
      content: dto.content,
      signalType: dto.signalType,
      type: dto.type,
      createdAt: new Date(),
      replyToId: dto.replyToId,
    });

    const savedMessage = await this.chatRepository.createMessage(newMessage);
    savedMessage.clientMessageId = dto.clientMessageId;
    this.logger.debug(
      `Message ${savedMessage.id} saved to conversation ${dto.conversationId}`,
    );

    return savedMessage;
  }
}
