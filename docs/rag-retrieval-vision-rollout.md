# RAG retrieval, citation, memory, and visual-index rollout

This document describes how to evaluate and roll out the retrieval and visual-index changes without changing production behavior blindly.

## 1. Citation correctness

Search uses enriched `retrievalText`, while answers and citations use grounded `evidenceText`.

Citation selection now runs after the final answer. A structured LLM receives the user question, final answer, and opaque evidence IDs. It may select only supplied evidence IDs; the application then rebuilds each citation from the trusted retrieval object. The LLM never writes the quote, reel ID, timestamp, or evidence type.

A reel citation contains:

- `reelId`
- `evidenceType` (`TRANSCRIPT`, `VISUAL`, or `METADATA`)
- optional title
- optional start/end timestamps
- a quote truncated from grounded evidence only

Safety and availability behavior:

- invented/unknown evidence IDs are discarded
- low-confidence attributions are discarded
- an empty attribution result remains empty rather than attaching unrelated evidence
- provider/JSON failures fall back to the previous grounded rerank-order citation selection
- transcript/visual citations never fall back to enriched `retrievalText`

Optional tuning:

```env
CLOUDFLARE_CITATION_MODEL=@cf/meta/llama-3.1-8b-instruct
AI_RAG_CITATION_MIN_CONFIDENCE=0.65
AI_RAG_CITATION_CANDIDATE_LIMIT=8
```

These are optional because the implementation has defaults and reuses the existing `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` credentials.

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

The default reranker is now a two-stage production path:

1. send the top retrieval candidates to Cloudflare Workers AI `@cf/baai/bge-reranker-base`
2. sigmoid-normalize the cross-encoder scores
3. apply MMR diversity over the neural scores so overlapping chunks/scenes do not dominate
4. fall back automatically to the deterministic reranker on timeout, provider errors, invalid JSON, or unusable scores

Optional tuning:

```env
AI_RAG_NEURAL_RERANK_ENABLED=true
AI_RAG_NEURAL_RERANK_MODEL=@cf/baai/bge-reranker-base
AI_RAG_NEURAL_RERANK_CANDIDATE_LIMIT=20
AI_RAG_NEURAL_RERANK_TIMEOUT_MS=5000
AI_RAG_NEURAL_RERANK_MAX_CONTEXT_CHARS=5000
AI_RAG_RERANK_MAX_LIMIT=8
AI_RAG_MMR_LAMBDA=0.82
AI_RAG_MMR_SAME_REEL_PENALTY=0.18
AI_RAG_MMR_TEMPORAL_OVERLAP_PENALTY=0.65
```

The deterministic reranker remains registered as the fail-open fallback and still combines retrieval signals, IDF-weighted query coverage, exact phrase matching, title/tag coverage, and MMR diversity.

Benchmark neural reranking against the deterministic baseline with the labelled retrieval evaluator. Record nDCG/MRR/Recall deltas plus p50/p95 latency and provider failure rate.

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

Before enabling hierarchical retrieval or adaptive sectioning globally, use representative labelled reel questions and compare the candidate configuration against the current production baseline. At minimum record relevance metrics, p50/p95 latency, provider calls, token/neuron cost, answer groundedness, citation precision, citation coverage, and refusal accuracy for missing visual/transcript evidence.
