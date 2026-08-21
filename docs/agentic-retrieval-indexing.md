# Bounded agentic retrieval and indexing

This implementation keeps LangGraph and deterministic infrastructure in control while allowing model reasoning only at bounded semantic boundaries. It follows the repository conventions in `QWEN.md`: application behavior lives under `application/use-cases`, provider and integration implementations stay under `infrastructure`, domain interfaces define ports, and inter-service communication remains RabbitMQ-only.

## Retrieval architecture

`LangGraphRagChatWorkflowAdapter` keeps the high-level graph topology, but each retrieval graph node now calls a single-entry application use case:

- `retrievalPlannerNode` -> `PlanRetrievalUseCase.execute(...)`
- `retrievalNode` -> `RetrieveReelEvidenceUseCase.execute(...)`
- `neuralRerankerNode` -> `RerankRetrievedEvidenceUseCase.execute(...)`

All three use cases depend on the `IRetrievalEngine` domain port rather than a concrete retrieval class. The module binds that port directly to `DeterministicRetrievalEngineAdapter` in `infrastructure/adapters`.

The resulting boundary is:

```text
LangGraphRagChatWorkflowAdapter
  -> PlanRetrievalUseCase
     -> IRetrievalEngine
        -> DeterministicRetrievalEngineAdapter

  -> RetrieveReelEvidenceUseCase
     -> IToolCallingLlmService
        -> CloudflareToolCallingLlmAdapter
     -> IRetrievalAgentPolicy
        -> RetrievalAgentPolicyAdapter
     -> IRetrievalEngine
        -> DeterministicRetrievalEngineAdapter

  -> RerankRetrievedEvidenceUseCase
     -> IRetrievalEngine
        -> DeterministicRetrievalEngineAdapter
```

There is no retrieval class-token alias and no application use case acting as the implementation of `IRetrievalEngine`.

The retrieval model can call only two high-level tools:

- `search_reel_content`: search reels already authorized for the current conversation.
- `get_reel_context`: focus retrieval on one already-authorized reel.

Both tools delegate through `IRetrievalEngine`, so access control, query embeddings, direct/hierarchical retrieval, reel/section/chunk search, transcript/visual evidence policy, RRF-backed semantic search, neighbour expansion, deduplication, and downstream neural reranking remain deterministic.

Visual retrieval is part of the deterministic engine. When the router requires `VISUAL`, the adapter calls `IReelSemanticIndexService.searchVisualScenes(...)` in both direct and hierarchical retrieval. For a visual-only route, transcript chunk search is skipped. Mixed evidence routes can retrieve transcript and visual-scene candidates together before hydration and reranking.

The model does not receive tools for SQL, pgvector, embeddings, RRF weighting, persistence, or authorization. A tool request can narrow router-approved evidence types but cannot widen them. If the tool loop fails or returns no useful evidence, retrieval falls back through the deterministic engine port.

### Retrieval rollout flags

```env
# Defaults to enabled outside production and disabled in production when omitted.
RAG_TOOL_CALLING_ENABLED=true

# Cloudflare OpenAI-compatible model used for tool selection.
CLOUDFLARE_TOOL_MODEL=@cf/openai/gpt-oss-20b

RAG_TOOL_MAX_STEPS=3
RAG_TOOL_MAX_PARALLEL_CALLS=2
RAG_TOOL_CALL_TIMEOUT_MS=8000
CLOUDFLARE_TOOL_TIMEOUT_MS=10000
```

`RetrievalAgentPolicyAdapter` resolves those infrastructure settings and is bound to the `IRetrievalAgentPolicy` string token. `RetrieveReelEvidenceUseCase` receives only the policy port.

## Application configuration boundary

Application use cases no longer import `ConfigService` directly. Runtime configuration is exposed through domain ports and implemented by infrastructure adapters:

```text
AI application use cases
  -> IAiApplicationConfig
     -> AiApplicationConfigAdapter
        -> ConfigService

reel-indexing application use cases
  -> IIndexingApplicationConfig
     -> IndexingApplicationConfigAdapter
        -> ConfigService
```

The AI port covers the application settings consumed by routing, verification, visual analysis, embedding batches, conversation memory, user-memory retrieval/upsert, and memory embedding backfill.

The reel-indexing port covers chunking, transcript sectioning, transcription-manifest processing, visual-manifest analysis, and evidence-candidate validation. Environment access remains in infrastructure while existing environment keys and fallback behavior remain unchanged.

The follow-up audit migrated nine AI production use cases and five reel-indexing production use cases away from direct `ConfigService` dependencies. Application-layer tests that previously depended on `ConfigService` now use the same domain configuration ports as their production use cases.

## Indexing architecture

`ReelIndexLangGraphWorkflow` remains the deterministic orchestrator and retains its checkpoint graph, transcription workers, visual branch, metadata processing, adaptive sectioning, embedding generation, candidate validation, inactive persistence, and atomic activation behavior.

The persisted-candidate quality node now uses one normal application use case:

```text
persisted_candidate_integrity_gate
  -> ValidatePersistedSemanticCandidateUseCase.execute(...)
     -> IPersistedSemanticCandidateValidator
        -> PersistedSemanticCandidateValidatorAdapter
           -> ISemanticCandidateInspector
     -> IIndexingAiService
        -> AiServiceAdapter
     -> IIndexQualityAgentPolicy
        -> IndexQualityAgentPolicyAdapter
```

`ValidatePersistedSemanticCandidateUseCase` always runs the deterministic persisted-state integrity validator first. If structural validation fails, semantic review does not run. If it succeeds, the optional semantic quality review runs while the candidate is still inactive. `CommitSemanticCandidateUseCase` remains the only activation path.

There is no class-token alias from `ValidatePersistedSemanticCandidateUseCase` to another use case, and `IPersistedSemanticCandidateValidator` is implemented by an infrastructure adapter rather than by constructing an application use case in the module.

### Inter-service quality-review boundary

Index quality review remains RabbitMQ request/response:

```text
reel-indexing-service
  AiServiceAdapter
    -> send('ai.review_index_quality', payload)
      -> ai-service IndexQualityAgentController
        -> ReviewIndexQualityUseCase
```

The request transport is validated with `IndexQualityReviewSchema` from `libs/common/src/ai/dtos/index-quality-review.dto.ts`. The indexing adapter validates before sending, and the AI controller validates again at the receiving boundary. The caller converts structured RMQ failures with `isRpcError()`.

### Quality-agent rollout flags

```env
# Defaults to enabled outside production and disabled in production when omitted.
INDEX_QUALITY_AGENT_ENABLED=true

# Advisory by default. Semantic rejection is logged but does not block activation.
INDEX_QUALITY_AGENT_ENFORCE=false

# When false, provider failure is fail-open only after deterministic integrity validation.
# When true, semantic reviewer availability becomes mandatory.
INDEX_QUALITY_AGENT_REQUIRED=false

INDEX_QUALITY_AGENT_MAX_DOCUMENTS=36
```

`IndexQualityAgentPolicyAdapter` resolves these values and is bound to the `IIndexQualityAgentPolicy` domain port.

## Validation

Make sure the local checkout is on the current branch before validation:

```bash
git fetch origin
git checkout refactor/retrieval-engine-boundary
git pull --ff-only origin refactor/retrieval-engine-boundary
```

If the earlier repository-wide `pnpm lint` left local `--fix` edits, inspect `git status --short` before pulling. Stash any local work you want to keep rather than discarding it blindly.

Run the QWEN dependency-direction checks first. These commands should print no matches:

```bash
rg -n "from ['\"]@nestjs/config['\"]|from ['\"][^'\"]*infrastructure/" \
  apps/ai-service/src/application \
  apps/reel-indexing-service/src/application

rg -n "provide:\s*[A-Za-z0-9_]+UseCase|provide:\s*RetrievalAgentUseCase|provide:\s*ValidatePersistedSemanticCandidateUseCase" \
  apps/ai-service/src/ai-service.module.ts \
  apps/reel-indexing-service/src/reel-indexing-service.module.ts
```

Lint only the TypeScript files changed by this branch first. This avoids mutating the whole repository and isolates PR-specific lint failures:

```bash
git diff --name-only origin/master...HEAD -- '*.ts' \
  | xargs -r pnpm exec eslint
```

Run focused tests next:

```bash
pnpm test -- --runInBand \
  apps/ai-service/src/application/use-cases/query-router-agent.use-case.spec.ts \
  apps/ai-service/src/application/use-cases/verifier-agent.use-case.spec.ts \
  apps/ai-service/src/infrastructure/adapters/cloudflare-tool-calling-llm.adapter.spec.ts \
  apps/ai-service/src/application/use-cases/retrieve-reel-evidence.use-case.spec.ts \
  apps/ai-service/src/infrastructure/adapters/deterministic-retrieval-engine.adapter.spec.ts \
  apps/ai-service/src/application/use-cases/build-rag-citations.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/analyze-visual-frame-manifest.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/build-short-evidence-chunks.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/validate-persisted-semantic-candidate.use-case.spec.ts
```

Compile both affected services:

```bash
pnpm build:ai
pnpm build:reel-indexing
```

Then run the broader regression suite and retrieval benchmark:

```bash
pnpm test -- --runInBand
pnpm ops:rag:benchmark
```

The repository-wide `pnpm lint` command executes ESLint with `--fix`. Run it only after the branch-specific checks are clean and after reviewing/stashing local work, because unrelated services may still have independent lint debt.

Expected retrieval logs when tool calling is active include `RetrievalToolAgent` entries showing selected tool names and accumulated result counts. Existing `RagGraph` retrieval, reranking, sufficiency, verification, and citation logs should continue afterward.

For indexing, the pre-existing visual/metadata/adaptive-sectioning logs continue unchanged. The semantic quality review remains immediately after deterministic persisted-candidate validation and before candidate commit.

## Audit note

The repeated port/implementation and class-token alias issue is fixed in both the AI retrieval graph and the reel-indexing persisted-candidate quality gate. The application-layer configuration leaks found during the follow-up audit are also fixed: the scoped AI and reel-indexing application production code no longer imports `ConfigService` directly, and application tests use the corresponding domain config ports rather than infrastructure configuration types.
