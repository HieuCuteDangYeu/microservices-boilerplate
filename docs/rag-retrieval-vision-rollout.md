# RAG retrieval, citation, memory, and visual-index rollout

This document defines the production rollout contract for the RAG retrieval, neural reranking, citation, and visual-index changes. A feature being deployed or having an active code path is **not** evidence that it is production-proven.

## 1. Current rollout state

Until fresh post-release evidence passes the readiness checks in this document, treat the features as follows:

| Capability | Implementation | Production claim allowed? | Serving posture |
| --- | --- | --- | --- |
| Direct reel retrieval | Active baseline | Yes | Serving |
| Hierarchical retrieval | Implemented | **No** until labelled + production gates pass | Shadow only |
| Neural cross-encoder reranking | Implemented with fallback | Only after fresh workflow telemetry exists | Serving with deterministic fallback |
| Claim-level LLM citations | Implemented with verification/repair | Only for responses that pass the runtime gates | Serving |
| Visual/OCR indexing | Implemented | **No end-to-end claim** until a fresh reel is indexed and visually cited | Canary/evidence collection |

Historical traces or index rows created before the release boundary do not satisfy promotion criteria.

## 2. Mandatory hierarchy rollout state

Production must start with direct retrieval serving and hierarchy running in shadow:

```env
RAG_HIERARCHICAL_RETRIEVAL_ENABLED=false
RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED=true
RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED=false
```

There is also a code-level production guard. In `NODE_ENV=production`, setting only:

```env
RAG_HIERARCHICAL_RETRIEVAL_ENABLED=true
```

is no longer enough to serve hierarchical retrieval. Serving hierarchy also requires:

```env
RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED=true
```

If production requests hierarchy without the promotion flag, the AI service serves **direct retrieval** and forces hierarchy into **shadow** mode. This protects production from an accidental environment-variable rollout.

Do not set `RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED=true` until the production-readiness command reports hierarchy `READY` using a labelled benchmark report created from fresh shadow observations.

## 3. Persisted hierarchy shadow evidence

Shadow comparisons are no longer log-only. Each fresh comparison is persisted in the AI database as `RagHierarchyShadowObservation` with:

- query/retrieval mode and required evidence type
- direct ranked chunk IDs
- hierarchical ranked chunk IDs
- direct latency
- hierarchical latency
- overlap@K
- Jaccard overlap

The AI migration is:

```text
apps/ai-service/prisma/migrations/
20260812190000_add_rag_hierarchy_shadow_observations/migration.sql
```

Overlap and Jaccard are **observability signals only**. They are not recall, relevance, or answer-quality metrics and are never sufficient for promotion.

## 4. Build a labelled hierarchy benchmark from production shadow traffic

First deploy the shadow-first state and collect fresh observations after a concrete release timestamp.

Export review cases from those observations:

```bash
node scripts/ops/rag-hierarchy-benchmark.cjs \
  --since 2026-08-12T12:00:00Z \
  --limit 100 \
  --export-template artifacts/rag-hierarchy-labels.json
```

The exported file contains the query, direct/hierarchical ranked IDs, and grounded candidate evidence. A reviewer must populate each case's `relevantIds` with every candidate that directly contains evidence relevant to answering that query. Leave `relevantIds` empty for unreviewed cases.

Then score the labelled cases:

```bash
node scripts/ops/rag-hierarchy-benchmark.cjs \
  --labels artifacts/rag-hierarchy-labels.json \
  --k 5 \
  --output artifacts/rag-hierarchy-benchmark.json
```

The output uses the same metric shape as `EvaluateRetrievalBenchmarkUseCase`:

- Recall@K
- reciprocal rank / MRR contribution
- nDCG@K
- direct metrics
- hierarchical metrics
- hierarchical-minus-direct deltas

Do not manufacture `relevantIds` from whichever algorithm ranked a candidate highest. Relevance labels must be determined from the evidence itself.

## 5. Production-readiness evidence gate

Use a concrete post-release timestamp. The command deliberately requires `--since` (or `RAG_PRODUCTION_EVIDENCE_SINCE`) so stale July traces cannot accidentally count as evidence for an August deployment.

```bash
node scripts/ops/rag-production-readiness.cjs \
  --since 2026-08-12T12:00:00Z \
  --benchmark artifacts/rag-hierarchy-benchmark.json \
  --target all \
  --output artifacts/rag-production-readiness.json
```

The command exits with:

- `0`: requested target passed all gates
- `2`: evidence is valid but promotion/readiness is still blocked
- `1`: the readiness check itself failed (configuration/database/file error)

Targets:

```bash
--target hierarchy
--target visual
--target all
```

Default conservative thresholds are configurable:

```env
RAG_READINESS_MIN_RAG_TRACES=50
RAG_READINESS_MIN_WORKFLOW_METRIC_COVERAGE=0.95
RAG_READINESS_MIN_RETRIEVAL_TIMING_TRACES=30
RAG_READINESS_MIN_HIERARCHY_SHADOW_OBSERVATIONS=30
RAG_READINESS_MIN_BENCHMARK_CASES=30
RAG_READINESS_MIN_RECALL_DELTA=-0.01
RAG_READINESS_MIN_MRR_DELTA=-0.01
RAG_READINESS_MIN_NDCG_DELTA=-0.01
RAG_READINESS_MAX_HIERARCHY_P95_LATENCY_RATIO=1.5
RAG_READINESS_MIN_FRESH_COMPLETED_INDEX_ATTEMPTS=1
RAG_READINESS_MIN_FRESH_ACTIVE_VISUAL_SCENES=1
RAG_READINESS_MIN_FRESH_VISUAL_REELS=1
RAG_READINESS_MIN_VISUAL_CITATION_TRACES=1
```

Changing a threshold is a rollout decision and should be recorded with the resulting report; do not lower thresholds merely to turn a failed gate green.

## 6. What proves hierarchy is ready

Hierarchy promotion requires all of the following after the release boundary:

1. enough fresh RAG traces
2. high coverage of the new workflow metrics
3. enough retrieval traces containing separate planner/retrieval/neural-reranker timings
4. enough persisted hierarchy shadow observations
5. acceptable hierarchy-vs-direct p95 latency ratio
6. enough human-labelled benchmark cases
7. non-regressing Recall@K
8. non-regressing MRR
9. non-regressing nDCG@K

The readiness report includes overlap/Jaccard averages for diagnosis, but they do not participate as relevance-quality gates.

Only after the report says hierarchy is ready may production intentionally use:

```env
RAG_HIERARCHICAL_RETRIEVAL_ENABLED=true
RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED=false
RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED=true
```

Keep the generated readiness JSON as the promotion evidence artifact.

## 7. What proves visual RAG works end-to-end

`ReelVisualScene` rows existing in the schema or a deployed vision adapter do not prove the workflow is operational.

A post-release canary reel must traverse:

```text
upload
→ media processing
→ visual-frame manifest
→ visual analysis
→ VISUAL_SCENE document construction
→ embedding quality gate
→ inactive persistence
→ persisted integrity gate
→ semantic commit
→ active ReelVisualScene rows
→ visual RAG retrieval
→ verified answer
→ VISUAL citation
```

The visual readiness gate requires, after the release boundary:

- at least one completed indexing attempt
- active `ReelVisualScene` rows created by fresh processing
- at least one fresh reel represented by those active visual rows
- at least one post-release RAG trace containing a `VISUAL` citation that references a reel with fresh active visual evidence

Recommended canary content should contain independent transcript-only and visual-only facts, for example:

```text
Speech: "The internal project name is Aurora."
Visible-only: "ORDER NUMBER: VLR-9281"
Visible-only later: "DISCOUNT: 25%"
```

Acceptance questions:

```text
What project name does the speaker say?
→ TRANSCRIPT evidence: Aurora

What order number is visible?
→ VISUAL evidence: VLR-9281

What discount is visible?
→ VISUAL evidence: 25%

What phone number is visible?
→ safe refusal if no phone number is present
```

Do not claim visual RAG works end-to-end until `--target visual` exits `0`.

## 8. Verified answer and citation workflow

Search uses enriched `retrievalText`, while answer generation, verification, and citations use grounded `evidenceText`.

The RAG graph produces a non-streaming draft first. Routes requiring verification must pass the verifier before tokens are published. Retrieval insufficiency has a bounded rewrite/retry path. Unsupported factual claims can trigger bounded answer repair before the final response is streamed.

Defaults:

```env
AI_RAG_MAX_RETRIEVAL_RETRIES=1
AI_RAG_MAX_ANSWER_REVISIONS=1
AI_RAG_VERIFIER_MIN_CONFIDENCE=0.65
AI_RAG_CITATION_COVERAGE_THRESHOLD=1
AI_RAG_MAX_CITATION_REVISIONS=1
```

Claim-level citation attribution receives opaque evidence IDs; the public citation payload is rebuilt from trusted retrieval objects. The LLM cannot invent public `reelId`, timestamp, evidence type, or quote fields.

RAG traces store retrieval/answer/citation retry counts, citation coverage, node timings, and grounded citation identity (`reelId`, `evidenceType`).

## 9. Neural reranking

The production reranker is:

```text
retrieval candidates
→ Cloudflare Workers AI cross-encoder
→ normalized neural relevance
→ MMR diversity
→ top context
```

with deterministic reranking as the fail-open fallback.

Defaults/tuning include:

```env
AI_RAG_NEURAL_RERANK_ENABLED=true
AI_RAG_NEURAL_RERANK_MODEL=@cf/baai/bge-reranker-base
AI_RAG_NEURAL_RERANK_CANDIDATE_LIMIT=20
AI_RAG_NEURAL_RERANK_TIMEOUT_MS=5000
AI_RAG_RERANK_MAX_LIMIT=8
AI_RAG_MMR_LAMBDA=0.82
```

Fresh production traces must contain separate `retrievalPlannerNode`, `retrievalNode`, and `neuralRerankerNode` timings before rollout performance is considered observed.

## 10. Visual/OCR indexing defaults

Media processing combines periodic sampling and FFmpeg scene-change detection, deduplicates nearby frames, caps the frame budget, uploads immutable artifacts, and writes a versioned manifest.

```env
MEDIA_VISUAL_PERIODIC_INTERVAL_SECONDS=4
MEDIA_VISUAL_SCENE_THRESHOLD=0.35
MEDIA_VISUAL_DEDUPE_WINDOW_MS=750
MEDIA_VISUAL_MAX_FRAMES=24
MEDIA_VISUAL_FRAME_EXTRACTION_TIMEOUT_MS=180000

CLOUDFLARE_AI_VISION_MODEL=@cf/moondream/moondream3.1-9B-A2B
AI_VISION_MAX_IMAGE_BYTES=4194304
INDEX_VISUAL_ANALYSIS_ENABLED=true
INDEX_VISUAL_ANALYSIS_REQUIRED=false
INDEX_VISUAL_ANALYSIS_CONCURRENCY=2
```

`INDEX_VISUAL_ANALYSIS_REQUIRED=false` keeps transcript/metadata indexing available during a vision-provider outage; it does not mean a reel without visual scenes can satisfy a visual-evidence question.

## 11. Index quality and stale-attempt safety

Adaptive section output is quality-gated before chunking. Embeddings are validated for dimensions, finite values, non-zero norm, and suspicious duplicate-vector ratios. Persisted semantic candidates are read back while inactive before activation.

Semantic activation/content completion uses a reversible saga:

1. verify the content-service attempt is current
2. discard stale inactive candidates
3. under a per-reel advisory lock, remember the previous active candidate
4. activate the new candidate without deleting the previous one
5. complete the exact content attempt
6. roll back only this candidate if stale/failing
7. finalize the new candidate and remove older inactive rows only after content accepts it

A stale attempt is not allowed to deactivate a newer candidate.

## 12. Database rollout

Generate clients and deploy both migrations before starting the updated services:

```bash
pnpm prisma:generate:reel-indexing
pnpm prisma:generate:ai
pnpm migrate:deploy:reel-indexing
pnpm migrate:deploy:ai
```

Relevant AI migrations include:

```text
20260812123000_add_rag_workflow_metrics
20260812190000_add_rag_hierarchy_shadow_observations
```

## 13. Focused validation before deployment

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

pnpm build:ai
pnpm build:content
pnpm build:reel-indexing
pnpm test
pnpm build:all
```

## 14. Promotion record

For each production promotion, retain:

- exact deployment/release timestamp used as `--since`
- labelled hierarchy file and benchmark report
- generated production-readiness JSON
- production environment flags used after promotion
- canary reel ID(s) used for visual validation
- any threshold overrides and rationale

If the report is blocked, the correct rollout action is to collect more valid evidence or fix the failing behavior—not to describe the feature as validated.
