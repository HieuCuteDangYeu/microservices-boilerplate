import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

@Catch()
export class CallWsExceptionFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();

    if (exception instanceof HttpException) {
      client.emit('exception', {
        status: 'error',
        message: this.getHttpExceptionMessage(exception),
      });
      return;
    }

    if (exception instanceof WsException) {
      client.emit('exception', {
        status: 'error',
        message: this.getWsExceptionMessage(exception),
      });
      return;
    }

    super.catch(exception, host);
  }

  private getHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string' && response.length > 0) {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const message = response['message'];

      if (typeof message === 'string' && message.length > 0) {
        return message;
      }

      if (Array.isArray(message) && typeof message[0] === 'string') {
        return message[0];
      }
    }

    return exception.message;
  }

  private getWsExceptionMessage(exception: WsException): string {
    const error = exception.getError();

    if (typeof error === 'string' && error.length > 0) {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const message = error['message'];

      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }

    return 'Internal server error';
  }
}
