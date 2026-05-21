import type {
  CompletedVideoProcessingPayload,
  FailedVideoProcessingPayload,
} from '@common/media/dtos/video-processing-result.dto';

export abstract class IConversationMediaService {
  abstract emitMediaProcessingCompleted(
    payload: CompletedVideoProcessingPayload,
  ): Promise<void>;

  abstract emitMediaProcessingFailed(
    payload: FailedVideoProcessingPayload,
  ): Promise<void>;
}
