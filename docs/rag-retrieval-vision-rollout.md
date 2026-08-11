# RAG retrieval, citation, memory, and visual-index rollout

This document describes how to evaluate and roll out the retrieval and visual-index changes without changing production behavior blindly.

## 1. Citation correctness

Search uses enriched `retrievalText`, while answers and citations use grounded `evidenceText`.

A reel citation now contains:

- `reelId`
- `evidenceType` (`TRANSCRIPT`, `VISUAL`, or `METADATA`)
- optional title
- optional start/end timestamps
- a quote truncated from grounded evidence only

Citations are preserved from `ai-service` through `conversation-service` and stored in bot-message metadata.

## 2. Retrieval modes

`REEL_VECTOR` performs semantic vector retrieval only.

`REEL_HYBRID` performs vector + PostgreSQL full-text retrieval. Explicit `#hashtags` are also passed to the tag-intersection lane. Results continue to use Reciprocal Rank Fusion in the semantic-index repository.

Visual questions use the visual-scene index. Transcript questions use transcript chunks. Mixed evidence requirements can retrieve both modalities before reranking.

## 3. Hierarchical retrieval benchmark

Keep hierarchical retrieval disabled while collecting shadow measurements:

```env
RAG_HIERARCHICAL_RETRIEVAL_ENABLED=false
RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED=true
```

The retrieval agent returns the direct result set but also executes the hierarchical path and logs:

- direct latency
- hierarchical latency
- result overlap at K
- Jaccard overlap

Use a labelled evaluation set with `EvaluateRetrievalBenchmarkUseCase` to compare:

- Recall@K
- MRR (mean reciprocal rank when aggregated)
- nDCG@K

Do not enable hierarchy globally based only on overlap. Prefer hierarchical retrieval only after labelled relevance metrics are non-regressing and latency/cost are acceptable.

## 4. Adaptive sectioning evaluation

Recommended initial settings:

```env
INDEX_LONG_ADAPTIVE_SECTIONING_ENABLED=false
INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_MODE=true
INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_SAMPLE_RATE=0.1
INDEX_SECTION_BOUNDARY_EVAL_TOLERANCE_SECONDS=15
```

Shadow evaluation logs:

- legacy/adaptive section count
- section-count delta
- boundary agreement
- average/min/max adaptive duration
- too-short/too-long section counts

The deterministic sample rate prevents semantic-boundary embeddings from being generated for every long reel while the feature is still shadow-only.

## 5. Reranking

The deterministic reranker remains the default. It combines calibrated retrieval signals, IDF-weighted query coverage, exact phrase matching, title/tag coverage, and MMR diversity.

Optional tuning:

```env
AI_RAG_MMR_LAMBDA=0.74
AI_RAG_MMR_SAME_REEL_PENALTY=0.22
AI_RAG_MMR_TEMPORAL_OVERLAP_PENALTY=0.7
```

Benchmark this implementation before introducing a neural cross-encoder so the additional latency/cost has a measurable target to beat.

## 6. Long-term memory consolidation

New memories still require explicit evidence from user-authored text. Semantically similar memories of the same type can be consolidated before insertion.

```env
AI_USER_MEMORY_DEDUPE_SEMANTIC_SCORE=0.94
AI_USER_MEMORY_DEDUPE_LEXICAL_SCORE=0.55
```

The implementation intentionally does not replace contradictory memories merely because they are semantically similar. Explicit supersession evidence should be introduced before implementing contradiction overwrite rules.

## 7. Visual/OCR indexing

Media processing extracts candidate frames using both periodic sampling and FFmpeg scene-change detection, deduplicates nearby samples, caps the frame budget, uploads immutable JPEG artifacts, and stores a versioned manifest with checksums and timestamps.

Recommended defaults:

```env
MEDIA_VISUAL_PERIODIC_INTERVAL_SECONDS=4
MEDIA_VISUAL_SCENE_THRESHOLD=0.35
MEDIA_VISUAL_DEDUPE_WINDOW_MS=750
MEDIA_VISUAL_MAX_FRAMES=24
MEDIA_VISUAL_FRAME_EXTRACTION_TIMEOUT_MS=180000
```

Indexing then verifies frame checksums and sends sampled frames to the vision service. The default Cloudflare vision model can be overridden:

```env
CLOUDFLARE_AI_VISION_MODEL=@cf/moondream/moondream3.1-9B-A2B
AI_VISION_MAX_IMAGE_BYTES=4194304
INDEX_VISUAL_ANALYSIS_ENABLED=true
INDEX_VISUAL_ANALYSIS_REQUIRED=false
INDEX_VISUAL_ANALYSIS_CONCURRENCY=2
```

`INDEX_VISUAL_ANALYSIS_REQUIRED=false` is deliberate: a vision-provider outage or quota limit should not prevent transcript/metadata indexing from activating. Set it to `true` only when visual evidence is a hard indexing requirement.

## 8. Index hierarchy

The semantic hierarchy is now:

```text
REEL
├── SECTION
│   └── CHUNK            (transcript evidence)
└── VISUAL_SCENE         (sampled-frame evidence)
```

`VISUAL_SCENE` is not treated as a transcript chunk. It has its own PostgreSQL table with generated full-text search data, GIN indexes, and an HNSW cosine index over the same 384-dimensional embedding space.

A visual scene stores grounded text derived from the sampled frame and a composite provenance hash tied to the frame checksum plus vision provider/model/version.

## 9. Database rollout

Apply reel-indexing Prisma migrations before starting the new reel-indexing build. The visual-scene migration adds the `VISUAL_SCENE` enum value and `ReelVisualScene` table/indexes.

Generate Prisma clients using the repository's normal install/build flow before compiling services.

## 10. Promotion criteria

Before enabling hierarchical retrieval or adaptive sectioning globally, use representative labelled reel questions and compare the candidate configuration against the current production baseline. At minimum record relevance metrics, p50/p95 latency, provider calls, token/neuron cost, answer groundedness, and refusal accuracy for missing visual/transcript evidence.
