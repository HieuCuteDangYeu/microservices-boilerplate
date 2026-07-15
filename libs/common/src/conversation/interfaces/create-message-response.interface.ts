import { MessageDto } from '../dtos/message.dto';

export interface CreateMessageError {
  code: 'AI_UNAVAILABLE' | 'NO_CONTENT' | 'UNKNOWN';
  message: string;
}

export interface CreateMessageResponse {
  message: MessageDto;
  /** False when this response is for a retry of an already persisted message. */
  created: boolean;
  botReply?: MessageDto;
  botError?: CreateMessageError;
}
