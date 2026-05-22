import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AcceptFriendRequestUseCase } from '@friend/application/use-cases/accept-friend-request.use-case';
import { CancelFriendRequestUseCase } from '@friend/application/use-cases/cancel-friend-request.use-case';
import { GetFriendshipStatusUseCase } from '@friend/application/use-cases/get-friendship-status.use-case';
import { ListFriendsUseCase } from '@friend/application/use-cases/list-friends.use-case';
import { ListIncomingFriendRequestsUseCase } from '@friend/application/use-cases/list-incoming-friend-requests.use-case';
import { ListOutgoingFriendRequestsUseCase } from '@friend/application/use-cases/list-outgoing-friend-requests.use-case';
import { RejectFriendRequestUseCase } from '@friend/application/use-cases/reject-friend-request.use-case';
import { RemoveFriendUseCase } from '@friend/application/use-cases/remove-friend.use-case';
import { SendFriendRequestUseCase } from '@friend/application/use-cases/send-friend-request.use-case';
import { CannotFriendSelfError } from '@friend/domain/errors/cannot-friend-self.error';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestAlreadyExistsError } from '@friend/domain/errors/friend-request-already-exists.error';
import { FriendRequestAlreadyReceivedError } from '@friend/domain/errors/friend-request-already-received.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import { FriendUserNotFoundError } from '@friend/domain/errors/friend-user-not-found.error';
import { FriendshipAlreadyExistsError } from '@friend/domain/errors/friendship-already-exists.error';
import { FriendshipNotFoundError } from '@friend/domain/errors/friendship-not-found.error';
import { SagaCompensationError } from '@common/domain/errors/saga.error';

@Controller()
export class FriendController {
  constructor(
    private readonly sendFriendRequestUseCase: SendFriendRequestUseCase,
    private readonly acceptFriendRequestUseCase: AcceptFriendRequestUseCase,
    private readonly rejectFriendRequestUseCase: RejectFriendRequestUseCase,
    private readonly cancelFriendRequestUseCase: CancelFriendRequestUseCase,
    private readonly listIncomingFriendRequestsUseCase: ListIncomingFriendRequestsUseCase,
    private readonly listOutgoingFriendRequestsUseCase: ListOutgoingFriendRequestsUseCase,
    private readonly listFriendsUseCase: ListFriendsUseCase,
    private readonly removeFriendUseCase: RemoveFriendUseCase,
    private readonly getFriendshipStatusUseCase: GetFriendshipStatusUseCase,
  ) {}

  @MessagePattern('friend.send_request')
  async sendRequest(@Payload() data: { userId: string; recipientId: string }) {
    try {
      return await this.sendFriendRequestUseCase.execute(
        data.userId,
        data.recipientId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.accept_request')
  async acceptRequest(@Payload() data: { userId: string; requestId: string }) {
    try {
      return await this.acceptFriendRequestUseCase.execute(
        data.userId,
        data.requestId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.reject_request')
  async rejectRequest(@Payload() data: { userId: string; requestId: string }) {
    try {
      return await this.rejectFriendRequestUseCase.execute(
        data.userId,
        data.requestId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.cancel_request')
  async cancelRequest(@Payload() data: { userId: string; requestId: string }) {
    try {
      return await this.cancelFriendRequestUseCase.execute(
        data.userId,
        data.requestId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.list_incoming_requests')
  async listIncomingRequests(@Payload() data: { userId: string }) {
    try {
      return await this.listIncomingFriendRequestsUseCase.execute(data.userId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.list_outgoing_requests')
  async listOutgoingRequests(@Payload() data: { userId: string }) {
    try {
      return await this.listOutgoingFriendRequestsUseCase.execute(data.userId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.list_friends')
  async listFriends(@Payload() data: { userId: string }) {
    try {
      return await this.listFriendsUseCase.execute(data.userId);
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.remove')
  async removeFriend(
    @Payload() data: { userId: string; friendUserId: string },
  ) {
    try {
      return await this.removeFriendUseCase.execute(
        data.userId,
        data.friendUserId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  @MessagePattern('friend.get_status')
  async getStatus(@Payload() data: { userId: string; otherUserId: string }) {
    try {
      return await this.getFriendshipStatusUseCase.execute(
        data.userId,
        data.otherUserId,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof CannotFriendSelfError) {
      throw new RpcException({
        statusCode: 400,
        message: error.message,
      });
    }

    if (
      error instanceof FriendUserNotFoundError ||
      error instanceof FriendRequestNotFoundError ||
      error instanceof FriendshipNotFoundError
    ) {
      throw new RpcException({
        statusCode: 404,
        message: error.message,
      });
    }

    if (
      error instanceof FriendRequestAlreadyExistsError ||
      error instanceof FriendRequestAlreadyReceivedError ||
      error instanceof FriendshipAlreadyExistsError
    ) {
      throw new RpcException({
        statusCode: 409,
        message: error.message,
      });
    }

    if (error instanceof FriendActionForbiddenError) {
      throw new RpcException({
        statusCode: 403,
        message: error.message,
      });
    }

    if (error instanceof SagaCompensationError) {
      throw new RpcException({
        statusCode: 500,
        message: error.message,
      });
    }

    throw new RpcException({
      statusCode: 500,
      message: 'Internal Server Error',
    });
  }
}
