ALTER TABLE "push_tokens"
ADD COLUMN "bundle_id" TEXT,
ADD COLUMN "delivery_environment" TEXT;

ALTER TABLE "notification_jobs"
ADD COLUMN "call_id" TEXT,
ADD COLUMN "expires_at" TIMESTAMP(3);

CREATE INDEX "notification_jobs_call_id_idx" ON "notification_jobs"("call_id");
