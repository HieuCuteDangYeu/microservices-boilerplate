import { MessageDto } from '../dtos/message.dto';

export interface MessageAnchorWindowResponse {
  targetMessageId: string;
  messages: MessageDto[];
  hasOlder: boolean;
  hasNewer: boolean;
  oldestCursor?: string;
  newestCursor?: string;
}
