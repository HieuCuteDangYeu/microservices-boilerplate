import type { PushDeliveryEnvironment } from '../entities/push-token.entity';

export type SendApnsVoipPushInput = {
  token: string;
  bundleId: string;
  deliveryEnvironment: PushDeliveryEnvironment;
  expiresAt?: Date;
  payload: Record<string, unknown>;
};

export abstract class IApnsVoipGateway {
  abstract send(input: SendApnsVoipPushInput): Promise<void>;
}
