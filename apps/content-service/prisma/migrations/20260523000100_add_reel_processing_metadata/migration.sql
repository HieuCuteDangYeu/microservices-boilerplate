ALTER TABLE "Reel"
ADD COLUMN "processingStage" TEXT,
ADD COLUMN "processingMessage" TEXT,
ADD COLUMN "processingProgress" INTEGER;

UPDATE "Reel"
SET
  "processingStage" = CASE
    WHEN "status" = 'PENDING' THEN 'QUEUED'
    WHEN "status" = 'PROCESSING' THEN 'PROCESSING'
    WHEN "status" = 'COMPLETED' THEN 'READY'
    WHEN "status" = 'FAILED' THEN 'FAILED'
    ELSE NULL
  END,
  "processingMessage" = CASE
    WHEN "status" = 'PENDING' THEN 'Queued for processing'
    WHEN "status" = 'PROCESSING' THEN 'Video is being processed'
    WHEN "status" = 'COMPLETED' THEN 'Video is ready to watch'
    WHEN "status" = 'FAILED' THEN 'Video processing failed'
    ELSE NULL
  END,
  "processingProgress" = CASE
    WHEN "status" = 'PENDING' THEN 0
    WHEN "status" = 'PROCESSING' THEN 10
    WHEN "status" = 'COMPLETED' THEN 100
    WHEN "status" = 'FAILED' THEN NULL
    ELSE NULL
  END;
