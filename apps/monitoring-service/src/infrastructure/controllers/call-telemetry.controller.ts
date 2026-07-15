import {
  CallTelemetryQuerySchema,
  CallTelemetryTimelineSchema,
  TrackCallTelemetrySchema,
} from '@common/calls/dtos/call-telemetry.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import type { ZodType } from 'zod';
import { GetCallTelemetrySummaryUseCase } from '../../application/use-cases/get-call-telemetry-summary.use-case';
import { GetCallTimelineUseCase } from '../../application/use-cases/get-call-timeline.use-case';
import { IngestCallTelemetryUseCase } from '../../application/use-cases/ingest-call-telemetry.use-case';
import { ListRecentCallLegsUseCase } from '../../application/use-cases/list-recent-call-legs.use-case';
import { InvalidTelemetryTokenError } from '../../domain/errors/invalid-telemetry-token.error';

@Controller()
export class CallTelemetryController {
  constructor(
    private readonly ingestTelemetry: IngestCallTelemetryUseCase,
    private readonly getSummary: GetCallTelemetrySummaryUseCase,
    private readonly getTimeline: GetCallTimelineUseCase,
    private readonly listRecentLegs: ListRecentCallLegsUseCase,
  ) {}

  @MessagePattern('call.telemetry.ingest')
  async ingest(@Payload() payload: unknown) {
    const { events } = this.parse(TrackCallTelemetrySchema, payload);

    try {
      return await this.ingestTelemetry.execute(events);
    } catch (error) {
      if (error instanceof InvalidTelemetryTokenError) {
        throw new RpcException({ statusCode: 400, message: error.message });
      }

      throw error;
    }
  }

  @MessagePattern('call.telemetry.summary')
  async summary(@Payload() payload: unknown) {
    return this.getSummary.execute(
      this.parse(CallTelemetryQuerySchema, payload),
    );
  }

  @MessagePattern('call.telemetry.timeline')
  async timeline(@Payload() payload: unknown) {
    const { callId } = this.parse(CallTelemetryTimelineSchema, payload);
    return this.getTimeline.execute(callId);
  }

  @MessagePattern('call.telemetry.recent')
  async recent(@Payload() payload: unknown) {
    return this.listRecentLegs.execute(
      this.parse(CallTelemetryQuerySchema, payload),
    );
  }

  private parse<T>(schema: ZodType<T>, payload: unknown): T {
    const result = schema.safeParse(payload);

    if (!result.success) {
      throw new RpcException({
        statusCode: 400,
        message: result.error.issues[0]?.message ?? 'Invalid telemetry payload',
      });
    }

    return result.data;
  }
}
