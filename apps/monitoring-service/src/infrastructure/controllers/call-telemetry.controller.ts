import { TrackCallTelemetrySchema } from '@common/calls/dtos/call-telemetry.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CallTelemetryService } from '../../application/services/call-telemetry.service';

@Controller()
export class CallTelemetryController {
  constructor(private readonly telemetryService: CallTelemetryService) {}

  @MessagePattern('call.telemetry.ingest')
  async ingest(@Payload() payload: unknown) {
    const { events } = TrackCallTelemetrySchema.parse(payload);
    return this.telemetryService.ingest(events);
  }

  @MessagePattern('call.telemetry.summary')
  async summary(
    @Payload()
    payload: {
      from: string;
      to: string;
      platform?: string;
      osVersion?: string;
      appVersion?: string;
      direction?: string;
    },
  ) {
    return this.telemetryService.summary(payload);
  }

  @MessagePattern('call.telemetry.timeline')
  async timeline(@Payload() payload: { callId: string }) {
    return this.telemetryService.callTimeline(payload.callId);
  }

  @MessagePattern('call.telemetry.recent')
  async recent(
    @Payload()
    payload: {
      from: string;
      to: string;
      platform?: string;
      osVersion?: string;
      appVersion?: string;
      direction?: string;
    },
  ) {
    return this.telemetryService.recentCallLegs(payload);
  }
}
