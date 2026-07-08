-- CreateIndex
CREATE INDEX "Reel_status_visibility_createdAt_idx" ON "Reel"("status", "visibility", "createdAt" DESC);
