# Reel pipeline Phase 6: semantic database and hybrid retrieval

## Scope

Reel Indexing Service is now the authoritative owner of semantic Reel,
section, chunk, transcription-segment, and indexing-attempt data. It stores no
foreign key to another service database. Content Service keeps its existing
chunk projection during the transition so current consumers remain compatible;
Phase 7 will move RAG and recommendation reads to the new `index.*` contracts.

An index job first stores an inactive semantic candidate. The candidate becomes
active only after Content Service accepts the same `indexAttemptId`. Stale
candidates are deleted, while the previously active semantic index remains
searchable until activation succeeds.

## Database and indexes

The Phase 6 migration creates:

```text
ReelDocument
ReelSection
ReelChunk
TranscriptionSegment
```

The existing checkpoint data is preserved while its table is renamed to the
`IndexingAttempt` model. Each semantic level has a 384-dimension vector column,
a cosine HNSW index with `m = 16` and `ef_construction = 64`, and a generated,
stored `tsvector` column with a GIN index. Tags also have GIN indexes.

The migration requires pgvector 0.8.0 or newer because filtered HNSW retrieval
uses iterative scans. Service startup independently validates this version.

Do not deploy the migration until the target database is explicitly selected:

```sh
pnpm run migrate:deploy:reel-indexing
```

## Runtime search configuration

```dotenv
INDEX_QUERY_PREFETCH=20
INDEX_HNSW_EF_SEARCH=100
INDEX_HNSW_ITERATIVE_SCAN=strict_order
INDEX_HNSW_MAX_SCAN_TUPLES=20000
INDEX_HNSW_SCAN_MEM_MULTIPLIER=1
```

The short indexing deployment owns the durable `reel_index_query` RPC queue.
Long-job workers remain isolated from query traffic.

## APIs and ranking

The query queue exposes:

```text
index.search_reels
index.search_sections
index.search_chunks
index.get_reel_document
index.delete_reel
index.reindex_reel
```

Search independently ranks vector, stored full-text, and metadata-tag
candidates, then combines their ordinal ranks with Reciprocal Rank Fusion using
`1 / (60 + rank)`. Raw cosine distance, text rank, and tag overlap are never
added directly. Filters support Reel, user, parent, tag, and source-length
constraints.

## Temporary verification

The scripts are read-only and remain temporary through final cleanup:

```sh
pnpm run tmp:verify:semantic-index
pnpm run tmp:explain:semantic-index -- "search words"
pnpm run tmp:benchmark:semantic-index
```

The benchmark reports short-Reel, long-document, section, chunk, and filtered
retrieval separately, including ANN Recall@K against exact search, p50, p95,
and table/index size. Empty categories are reported as skipped rather than
being populated with synthetic production data.
