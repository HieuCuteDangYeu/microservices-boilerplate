CREATE TABLE "call_telemetry_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "call_id" TEXT,
    "role" TEXT,
    "event_type" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "outcome" TEXT,
    "elapsed_ms" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "os_version" TEXT,
    "direction" TEXT,
    "error_code" TEXT,
    "metrics_json" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_telemetry_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_telemetry_events_event_id_key" ON "call_telemetry_events"("event_id");
CREATE INDEX "call_telemetry_events_received_at_idx" ON "call_telemetry_events"("received_at");
CREATE INDEX "call_telemetry_events_platform_app_version_event_type_idx" ON "call_telemetry_events"("platform", "app_version", "event_type");
CREATE INDEX "call_telemetry_events_call_id_occurred_at_idx" ON "call_telemetry_events"("call_id", "occurred_at");
