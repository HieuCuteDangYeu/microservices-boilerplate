ALTER TABLE "User"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "username" TEXT;

WITH prepared AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        TRIM(
          BOTH '_' FROM REGEXP_REPLACE(
            LOWER(SPLIT_PART("email", '@', 1)),
            '[^a-z0-9_]+',
            '_',
            'g'
          )
        ),
        ''
      ),
      'user'
    ) AS sanitized_username,
    COALESCE(
      NULLIF(
        LEFT(
          BTRIM(
            REGEXP_REPLACE(
              INITCAP(
                REGEXP_REPLACE(
                  SPLIT_PART("email", '@', 1),
                  '[^A-Za-z0-9]+',
                  ' ',
                  'g'
                )
              ),
              '\s+',
              ' ',
              'g'
            )
          ),
          80
        ),
        ''
      ),
      'User'
    ) AS generated_full_name
  FROM "User"
),
normalized AS (
  SELECT
    "id",
    generated_full_name,
    CASE
      WHEN LENGTH(sanitized_username) < 3 THEN 'user'
      ELSE LEFT(sanitized_username, 30)
    END AS base_username
  FROM prepared
),
ranked AS (
  SELECT
    "id",
    generated_full_name,
    base_username,
    ROW_NUMBER() OVER (PARTITION BY base_username ORDER BY "id") AS duplicate_rank
  FROM normalized
)
UPDATE "User" AS "user_record"
SET
  "fullName" = ranked.generated_full_name,
  "username" = CASE
    WHEN ranked.duplicate_rank = 1 THEN ranked.base_username
    ELSE LEFT(ranked.base_username, 21) || '_' || RIGHT(REPLACE("user_record"."id", '-', ''), 8)
  END
FROM ranked
WHERE "user_record"."id" = ranked."id";

ALTER TABLE "User"
ALTER COLUMN "fullName" SET NOT NULL,
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_fullName_idx" ON "User"("fullName");
