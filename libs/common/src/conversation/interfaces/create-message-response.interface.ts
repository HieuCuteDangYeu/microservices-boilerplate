import { MessageDto } from '../dtos/message.dto';

export interface CreateMessageError {
  code: 'AI_UNAVAILABLE' | 'NO_CONTENT' | 'UNKNOWN';
  message: string;
}

export interface CreateMessageResponse {
  message: MessageDto;
  botReply?: MessageDto;
  botError?: CreateMessageError;
}
