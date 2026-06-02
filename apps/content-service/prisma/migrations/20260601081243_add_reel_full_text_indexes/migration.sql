CREATE INDEX IF NOT EXISTS "ReelChunk_text_fts_idx"
ON "ReelChunk"
USING GIN (
  to_tsvector('simple', coalesce("text", ''))
);

CREATE INDEX IF NOT EXISTS "Reel_title_description_fts_idx"
ON "Reel"
USING GIN (
  to_tsvector(
    'simple',
    coalesce("title", '') || ' ' || coalesce("description", '')
  )
);