import { isRpcError } from '@common/constants/rpc-error.types';
import type { IConversationService } from '@friend/domain/interfaces/conversation-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom, of, timeout } from 'rxjs';

@Injectable()
export class ConversationServiceAdapter implements IConversationService {
  private readonly logger = new Logger(ConversationServiceAdapter.name);

  constructor(
    @Inject('CONVERSATION_SERVICE_RMQ')
    private readonly client: ClientProxy,
  ) {}

  async createDirectConversation(
    userId: string,
    otherUserId: string,
  ): Promise<string | null> {
    const result = await lastValueFrom(
      this.client
        .send<{ id: string }>('create_conversation', {
          participantIds: [userId, otherUserId],
          isGroup: false,
          creatorId: userId,
        })
        .pipe(
          timeout(5000),
          catchError((error: unknown) => {
            this.logger.error(
              `Direct conversation creation failed: ${this.describeError(
                error,
              )}`,
            );

            return of(null);
          }),
        ),
    );

    if (
      !result ||
      typeof result.id !== 'string' ||
      result.id.trim().length === 0
    ) {
      return null;
    }

    return result.id;
  }

  private describeError(error: unknown): string {
    if (isRpcError(error)) {
      return Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown conversation service error';
  }
}
