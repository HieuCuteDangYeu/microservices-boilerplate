import { MessageDto } from '../dtos/message.dto';

export interface MessageAnchorExpansionResponse {
  messages: MessageDto[];
  hasMore: boolean;
  nextCursor?: string;
}
