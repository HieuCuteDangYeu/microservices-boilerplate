export type SendFcmPushInput = {
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  androidChannelId?: string;
  androidSound?: string;
  includeNotification?: boolean;
  apnsContentAvailable?: boolean;
  apnsBackground?: boolean;
  apnsSound?: string;
};

export abstract class IFcmPushGateway {
  abstract send(input: SendFcmPushInput): Promise<string>;
}
