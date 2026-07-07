-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device_id" TEXT,
    "app_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_tokens_user_id_is_active_idx" ON "push_tokens"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "push_tokens_provider_platform_idx" ON "push_tokens"("provider", "platform");

-- CreateIndex
CREATE INDEX "push_tokens_last_seen_at_idx" ON "push_tokens"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_provider_token_key" ON "push_tokens"("provider", "token");

-- CreateIndex
CREATE INDEX "notification_jobs_status_next_attempt_at_idx" ON "notification_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_jobs_recipient_user_id_created_at_idx" ON "notification_jobs"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_type_created_at_idx" ON "notification_jobs"("type", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_conversation_id_idx" ON "notification_jobs"("conversation_id");
