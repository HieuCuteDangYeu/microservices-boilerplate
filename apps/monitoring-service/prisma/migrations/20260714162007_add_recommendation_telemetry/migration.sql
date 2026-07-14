-- CreateTable
CREATE TABLE "recommendation_telemetry_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "recommendation_type" TEXT NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "feed_session_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "candidate_source" TEXT NOT NULL,
    "requested_limit" INTEGER NOT NULL,
    "returned_items" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "error_code" TEXT,
    "feature_flags" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_telemetry_events_event_id_key" ON "recommendation_telemetry_events"("event_id");

-- CreateIndex
CREATE INDEX "recommendation_telemetry_events_occurred_at_idx" ON "recommendation_telemetry_events"("occurred_at");

-- CreateIndex
CREATE INDEX "recommendation_telemetry_events_recommendation_type_algorit_idx" ON "recommendation_telemetry_events"("recommendation_type", "algorithm_version", "outcome");

-- CreateIndex
CREATE INDEX "recommendation_telemetry_events_candidate_source_occurred_a_idx" ON "recommendation_telemetry_events"("candidate_source", "occurred_at");

-- CreateIndex
CREATE INDEX "recommendation_telemetry_events_feed_session_id_idx" ON "recommendation_telemetry_events"("feed_session_id");

-- CreateIndex
CREATE INDEX "recommendation_telemetry_events_route_occurred_at_idx" ON "recommendation_telemetry_events"("route", "occurred_at");
