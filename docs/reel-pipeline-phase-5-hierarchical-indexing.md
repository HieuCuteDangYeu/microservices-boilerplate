# Reel pipeline Phase 5: hierarchical indexing and batch embeddings

## Scope

Phase 5 replaces Reel Indexing Service's per-chunk embedding loop with
deterministic hierarchical documents and `ai.generate_embedding_batch`.
Embedding results are cached durably by stable item ID, normalized input hash,
provider/model/version, index version, chunking version, and summary version.

Phase 6 still owns the final `ReelDocument`, `ReelSection`, and `ReelChunk`
semantic tables, vector columns, and HNSW indexes. Phase 5 stores the reusable
embedding cache in the existing indexing database and continues projecting
chunk documents to Content Service for compatibility with current retrieval.

## Document hierarchy

Short videos produce one bounded Reel document and deterministic chunk
documents. Long videos produce:

```text
Reel document
Section documents
Chunk documents
```

The Reel document contains bounded title, summary, and topics. Section
documents use bounded section summaries. Chunk documents contain precise
timestamped transcript evidence.

Chunk boundaries use whitespace-token counts, transcript timestamps, sentence
ends, section boundaries, and overlap. Embeddings are generated only after the
final document boundaries are known.

Defaults:

```dotenv
INDEX_CHUNK_TARGET_TOKENS=240
INDEX_CHUNK_MAX_TOKENS=350
INDEX_CHUNK_MIN_TOKENS=80
INDEX_CHUNK_OVERLAP_TOKENS=40
INDEX_CHUNK_MAX_SECONDS=45
INDEX_SECTION_TARGET_SECONDS=300
INDEX_SECTION_MAX_SECONDS=480
INDEX_EMBEDDING_BATCH_SIZE=32
AI_EMBEDDING_BATCH_CONCURRENCY=4
INDEX_VERSION=reel-index-v2
INDEX_CHUNKING_VERSION=reel-chunk-v2
INDEX_SUMMARY_VERSION=reel-summary-v1
INDEX_EMBEDDING_PROVIDER=google
INDEX_EMBEDDING_MODEL=gemini-embedding-001
INDEX_EMBEDDING_VERSION=1
INDEX_EMBEDDING_DIMENSIONS=384
```

## Batch and retry behavior

Each RabbitMQ batch carries stable IDs and bounded text only. It never carries
audio or existing vectors. AI Service limits concurrent provider requests and
returns successes plus per-item failures. Reel Indexing Service commits every
successful item to `EmbeddingCacheEntry` before reporting a partial failure.

A retry rebuilds the same deterministic IDs and hashes, loads matching cached
items, and sends only missing or version-mismatched documents. It does not keep
all long-video vectors inside the job checkpoint.

## Migration

The Phase 5 migration adds only the versioned embedding cache:

```sh
pnpm run migrate:deploy:reel-indexing
```

Do not run it until the target `REEL_INDEXING_DATABASE_URL` has been explicitly
selected and confirmed. Verification does not apply migrations.

## Operations

Queue a fresh index attempt without repeating media encoding:

```sh
pnpm run ops:reindex:reel -- <reelId>
pnpm run ops:reindex:status -- <reelId>
```

The reindex request changes `indexAttemptId` and writes the index outbox event
in one Content database transaction.

Temporary deterministic construction benchmark:

```sh
pnpm run tmp:benchmark:indexing
```

The benchmark emits counts and timing only; it does not log transcript bodies
or embedding vectors.
