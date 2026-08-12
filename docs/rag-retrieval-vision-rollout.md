# RAG retrieval, citation, memory, and visual-index rollout

This document describes how to evaluate and roll out the retrieval and visual-index changes without changing production behavior blindly.

## 1. Verified answer and citation workflow

Search uses enriched `retrievalText`, while answer generation, verification, and citations use grounded `evidenceText`.

The RAG graph now produces a non-streaming draft first. Routes that require verification must pass the verifier before any answer tokens are published. A failed verifier can request one bounded answer revision; verifier-provider failure is fail-closed for routes that require verification.

Retrieval insufficiency now has a real bounded repair path: `REWRITE_AND_RETRY` rewrites the search query using the failure/missing-modality context and reruns retrieval before refusing.

Default production guards:

```env
AI_RAG_MAX_RETRIEVAL_RETRIES=1
AI_RAG_MAX_ANSWER_REVISIONS=1
AI_RAG_VERIFIER_MIN_CONFIDENCE=0.65
```

Memory retrieval and reel retrieval run as parallel graph branches with an explicit readiness barrier before draft generation. Reel recommendations also run independently after routing and fail open so recommendation-provider failure does not fail the answer path.

### Claim-level citation attribution

Citation attribution runs on the verified draft before streaming. A structured LLM receives the user question, final draft, and opaque evidence IDs. It extracts externally checkable factual claims and determines which supplied evidence IDs directly support each claim.

The LLM never writes the public citation payload. The application rebuilds each citation from the trusted retrieval object, including:

- `reelId`
- `evidenceType` (`TRANSCRIPT`, `VISUAL`, or `METADATA`)
- optional title
- optional start/end timestamps
- a quote truncated from grounded evidence only

Safety behavior:

- invented/unknown evidence IDs are discarded
- low-confidence support judgments are treated as unsupported
- transcript/visual citations never fall back to enriched `retrievalText`
- unsupported factual claims count against citation coverage
- below-threshold coverage requests one bounded answer revision; if coverage still fails, the graph emits a safe verified-refusal
- provider/JSON failure falls back to grounded deterministic citation selection only after the answer has already passed verification

Default citation settings:

```env
CLOUDFLARE_CITATION_MODEL=@cf/meta/llama-3.1-8b-instruct
AI_RAG_CITATION_MIN_CONFIDENCE=0.65
AI_RAG_CITATION_CANDIDATE_LIMIT=8
AI_RAG_CITATION_TIMEOUT_MS=4000
AI_RAG_CITATION_COVERAGE_THRESHOLD=1
AI_RAG_MAX_CITATION_REVISIONS=1
```

The default coverage threshold is intentionally `1`: every factual reel claim identified by the attribution verifier must be directly supported before streaming.

Citations remain preserved from `ai-service` through `conversation-service` and bot-message metadata. RAG traces now also preserve `reelId` and `evidenceType` and record retrieval/answer/citation retry counts plus final citation coverage.

## 2. Retrieval modes and repair

`REEL_VECTOR` performs semantic vector retrieval only.

`REEL_HYBRID` performs vector + PostgreSQL full-text retrieval. Explicit `#hashtags` are also passed to the tag-intersection lane. Results continue to use Reciprocal Rank Fusion in the semantic-index repository.

Visual questions use the visual-scene index. Transcript questions use transcript chunks. Mixed evidence requirements can retrieve both modalities before reranking.

The LangGraph workflow now invokes the retrieval application use case as three distinct stages: `retrievalPlannerNode -> retrievalNode -> neuralRerankerNode`. Planning, raw retrieval, and cross-encoder/MMR latency therefore appear separately in node timings. A repaired query loops back through the planner so its new query set and search limits are explicit before the retry executes.

## 3. Hierarchical retrieval benchmark

Keep hierarchical retrieval disabled while collecting shadow measurements:

```env
RAG_HIERARCHICAL_RETRIEVAL_ENABLED=false
RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED=true
```

The retrieval layer returns the direct result set but also executes the hierarchical path and logs:

- direct latency
- hierarchical latency
- result overlap at K
- Jaccard overlap

Use a labelled evaluation set with `EvaluateRetrievalBenchmarkUseCase` to compare:

- Recall@K
- MRR
- nDCG@K
- hit rate
- average latency

Do not enable hierarchy globally based only on overlap. Promote hierarchical retrieval only after labelled relevance metrics are non-regressing and latency/cost are acceptable.

## 4. Adaptive sectioning and section quality gate

Recommended initial settings:

```env
INDEX_LONG_ADAPTIVE_SECTIONING_ENABLED=false
INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_MODE=true
INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_SAMPLE_RATE=0.1
INDEX_SECTION_BOUNDARY_EVAL_TOLERANCE_SECONDS=15
INDEX_LONG_SECTION_MIN_SECONDS=120
INDEX_LONG_SECTION_MAX_SECONDS=480
```

Shadow evaluation logs:

- legacy/adaptive section count
- section-count delta
- boundary agreement
- average/min/max adaptive duration
- too-short/too-long section counts

When adaptive output is used by the indexing graph, it now passes through a deterministic section-quality gate before chunk construction. The gate checks timestamp validity/order, overlap, duration tolerance, undersized-section ratio, and transcript start/end coverage. Unhealthy adaptive output falls back to the legacy sectioner instead of activating a malformed hierarchy.

## 5. Neural reranking

The default reranker is a two-stage production path:

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

The deterministic reranker remains the fail-open fallback and combines retrieval signals, IDF-weighted query coverage, exact phrase matching, title/tag coverage, and MMR diversity.

Benchmark neural reranking against the deterministic baseline with the labelled retrieval evaluator. Record nDCG/MRR/Recall deltas plus p50/p95 latency and provider failure rate.

## 6. Long-term memory consolidation

New memories still require explicit evidence from user-authored text. Semantically similar memories of the same type can be consolidated before insertion.

```env
AI_USER_MEMORY_DEDUPE_SEMANTIC_SCORE=0.94
AI_USER_MEMORY_DEDUPE_LEXICAL_SCORE=0.55
```

The implementation intentionally does not replace contradictory memories merely because they are semantically similar. Explicit supersession evidence should be introduced before implementing contradiction overwrite rules.

## 7. Parallel visual/OCR indexing

Media processing extracts candidate frames using both periodic sampling and FFmpeg scene-change detection, deduplicates nearby samples, caps the frame budget, uploads immutable JPEG artifacts, and stores a versioned manifest with checksums and timestamps.

Recommended defaults:

```env
MEDIA_VISUAL_PERIODIC_INTERVAL_SECONDS=4
MEDIA_VISUAL_SCENE_THRESHOLD=0.35
MEDIA_VISUAL_DEDUPE_WINDOW_MS=750
MEDIA_VISUAL_MAX_FRAMES=24
MEDIA_VISUAL_FRAME_EXTRACTION_TIMEOUT_MS=180000
```

In reel indexing, visual analysis is now an explicit LangGraph branch that runs in parallel with the transcript branch. The visual branch writes only visual evidence/readiness state; transcript processing owns its own progress state. Both branches join before metadata/chunk construction.

Frame integrity and transport encoding remain outside the application layer: the R2 infrastructure adapter verifies the manifest SHA-256 before returning bytes, and the AI infrastructure adapter converts bytes to the base64 RMQ DTO.

```env
CLOUDFLARE_AI_VISION_MODEL=@cf/moondream/moondream3.1-9B-A2B
AI_VISION_MAX_IMAGE_BYTES=4194304
INDEX_VISUAL_ANALYSIS_ENABLED=true
INDEX_VISUAL_ANALYSIS_REQUIRED=false
INDEX_VISUAL_ANALYSIS_CONCURRENCY=2
```

`INDEX_VISUAL_ANALYSIS_REQUIRED=false` is deliberate: a vision-provider outage or quota limit should not prevent transcript/metadata indexing from activating. Set it to `true` only when visual evidence is a hard indexing requirement.

## 8. Index hierarchy and metadata authority

The semantic hierarchy is:

```text
REEL
├── SECTION
│   └── CHUNK            (transcript evidence)
└── VISUAL_SCENE         (sampled-frame evidence)
```

`VISUAL_SCENE` is not treated as a transcript chunk. It has its own PostgreSQL table with generated full-text search data, GIN indexes, and an HNSW cosine index over the same 384-dimensional embedding space.

Creator-authored title and description remain authoritative during metadata extraction. AI-derived values fill missing fields rather than silently replacing creator text; derived tags are unioned with user tags.

## 9. Embedding and persisted-candidate quality gates

After embeddings are generated, the graph validates:

- declared dimensions match actual vector length
- all values are finite
- vector norm is non-zero
- exact duplicate-vector ratio is not suspicious for multi-document candidates

Default duplicate guard:

```env
INDEX_EMBEDDING_MAX_DUPLICATE_RATIO=0.5
```

After semantic rows are persisted but while they are still inactive, an independent Prisma read-back inspector compares persisted counts with the materialized candidate:

- exactly one REEL document
- expected SECTION count
- expected CHUNK count
- expected VISUAL_SCENE count
- expected transcript segment count
- zero active candidate documents before commit

A mismatch prevents activation.

## 10. Stale-attempt commit guard and compensation

Semantic activation and content completion now use a reversible commit saga instead of activating/deleting old semantic rows before content-service checks staleness.

The commit sequence is:

1. verify the content-service attempt is still current
2. if stale, discard the inactive semantic candidate
3. under a per-reel PostgreSQL advisory lock, remember the previous active semantic attempt and activate the new candidate without deleting the previous rows
4. atomically ask content-service to complete the exact attempt
5. if content rejects the attempt as stale, roll semantic activation back to the previous candidate only if this attempt is still active, then discard the stale candidate
6. if a newer semantic attempt has already become active, the older rollback leaves that newer candidate untouched
7. if content accepts the current attempt, finalize the semantic candidate and delete older inactive rows

Pre-commit workflow failures discard only inactive candidate rows. The application use case depends on the `IReelIndexWorkflow` domain port rather than importing the LangGraph infrastructure workflow directly.

This does not turn two independent databases into a distributed ACID transaction; it provides bounded compensation and prevents the prior stale-attempt activation path.

## 11. Database rollout

Generate clients, then apply both service migrations before building/deploying:

```bash
pnpm prisma:generate:reel-indexing
pnpm prisma:generate:ai
pnpm migrate:deploy:reel-indexing
pnpm migrate:deploy:ai
```

The AI migration `20260812123000_add_rag_workflow_metrics` adds `RagTrace.workflowMetrics` for repair/coverage observability.

The reel-indexing migrations include the visual-scene hierarchy/schema introduced by the earlier visual indexing work.

## 12. Focused validation

Run the graph-related unit tests first:

```bash
pnpm exec jest --runInBand \
  apps/ai-service/src/application/use-cases/build-rag-citations.use-case.spec.ts \
  apps/ai-service/src/application/use-cases/verifier-agent.use-case.spec.ts \
  apps/ai-service/src/infrastructure/adapters/cloudflare-citation-attribution.adapter.spec.ts \
  apps/ai-service/src/infrastructure/adapters/cloudflare-cross-encoder-reranker.adapter.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/analyze-visual-frame-manifest.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/validate-embedding-quality.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/select-healthy-transcript-sections.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/commit-semantic-candidate.use-case.spec.ts
```

Then compile the affected services:

```bash
pnpm build:ai
pnpm build:content
pnpm build:reel-indexing
```

Finally run the repository suite:

```bash
pnpm test
pnpm build:all
```

## 13. Promotion criteria

Before enabling hierarchical retrieval or adaptive sectioning globally, use representative labelled reel questions and compare the candidate configuration against the current production baseline. At minimum record:

- Recall/MRR/nDCG
- planner/retrieval/neural-reranker p50/p95 latency separately
- neural-reranker fallback rate
- retrieval-repair rate and success rate
- answer-revision rate
- verifier failure/provider-unavailability rate
- citation precision and claim coverage
- safe-refusal accuracy for missing visual/transcript evidence
- visual analysis latency/failure rate
- adaptive-section fallback rate
- embedding-quality failures
- persisted-candidate integrity failures
- stale-attempt compensation events

Do not promote based only on successful happy-path answers.