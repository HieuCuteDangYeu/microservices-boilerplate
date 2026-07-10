import { z } from 'zod';

const finiteNumber = z.number().finite();
const audioRouteType = z.enum([
  'receiver',
  'speaker',
  'bluetooth_hfp',
  'bluetooth_a2dp',
  'bluetooth_le',
  'headphones',
  'airplay',
  'car_audio',
  'usb_audio',
  'line_out',
  'other',
]);

export const CallTelemetryEventSchema = z
  .object({
    eventId: z.string().uuid(),
    attemptId: z.string().uuid(),
    telemetryToken: z.string().min(20).max(2048).optional(),
    eventType: z.enum(['setup_stage', 'quality_sample', 'terminal']),
    stage: z.string().min(1).max(64),
    outcome: z.enum(['started', 'succeeded', 'failed', 'ended']).optional(),
    elapsedMs: finiteNumber.min(0).max(86_400_000),
    occurredAt: z.string().datetime(),
    platform: z.enum(['ios', 'android', 'web']),
    appVersion: z.string().min(1).max(64),
    osVersion: z.string().min(1).max(64).optional(),
    direction: z.enum(['incoming', 'outgoing']).optional(),
    errorCode: z.string().min(1).max(80).optional(),
    metrics: z
      .object({
        packetLossRate: finiteNumber.min(0).max(1).nullable().optional(),
        jitterMs: finiteNumber.min(0).max(60_000).nullable().optional(),
        roundTripTimeMs: finiteNumber.min(0).max(60_000).nullable().optional(),
        concealmentRate: finiteNumber.min(0).max(1).nullable().optional(),
        jitterBufferDelayMs: finiteNumber
          .min(0)
          .max(60_000)
          .nullable()
          .optional(),
        packetsReceivedDelta: finiteNumber.min(0).nullable().optional(),
        bytesReceivedDelta: finiteNumber.min(0).nullable().optional(),
      })
      .strict()
      .optional(),
    details: z
      .object({
        audioRoute: z
          .object({
            category: z.enum(['play_and_record', 'other']),
            mode: z.enum(['voice_chat', 'other']),
            outputRouteTypes: z.array(audioRouteType).max(4),
            inputRouteTypes: z.array(audioRouteType).max(4),
            forcedSpeaker: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const TrackCallTelemetrySchema = z
  .object({
    events: z.array(CallTelemetryEventSchema).min(1).max(50),
  })
  .strict();

export type CallTelemetryEventPayload = z.infer<
  typeof CallTelemetryEventSchema
>;
export type TrackCallTelemetryPayload = z.infer<
  typeof TrackCallTelemetrySchema
>;
