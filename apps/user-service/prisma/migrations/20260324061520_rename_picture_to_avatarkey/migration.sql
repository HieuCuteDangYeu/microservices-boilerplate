-- 1. Safely rename the column without dropping data
ALTER TABLE "User" RENAME COLUMN "picture" TO "avatarKey";

-- 2. Strip your R2 domain from existing records to convert them into raw keys.
-- (Make sure to replace the URL below with your actual R2 domain!)
UPDATE "User"
SET "avatarKey" = REPLACE("avatarKey", 'https://cdn.velora-app.me/', '')
WHERE "avatarKey" LIKE 'https://cdn.velora-app.me/%';

-- Note: Any Google/GitHub OAuth URLs (https://lh3.googleusercontent.com/...) 
-- will be completely ignored by this UPDATE statement and safely preserved!