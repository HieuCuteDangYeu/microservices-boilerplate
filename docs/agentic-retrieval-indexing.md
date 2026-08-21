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

Run the focused tests first:

```bash
pnpm test -- --runInBand \
  apps/ai-service/src/infrastructure/adapters/cloudflare-tool-calling-llm.adapter.spec.ts \
  apps/ai-service/src/application/use-cases/retrieve-reel-evidence.use-case.spec.ts \
  apps/ai-service/src/infrastructure/adapters/deterministic-retrieval-engine.adapter.spec.ts \
  apps/ai-service/src/application/use-cases/build-rag-citations.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/validate-persisted-semantic-candidate.use-case.spec.ts
```

Compile the affected services:

```bash
pnpm build:ai
pnpm build:reel-indexing
```

Run regression tests and the existing retrieval benchmark:

```bash
pnpm test -- --runInBand
pnpm ops:rag:benchmark
```

Expected retrieval logs when tool calling is active include `RetrievalToolAgent` entries showing selected tool names and accumulated result counts. Existing `RagGraph` retrieval, reranking, sufficiency, verification, and citation logs should continue afterward.

For indexing, the pre-existing visual/metadata/adaptive-sectioning logs continue unchanged. The semantic quality review remains immediately after deterministic persisted-candidate validation and before candidate commit.

## Scope note

This refactor fixes the repeated port/implementation and class-token alias issue in both the AI retrieval graph and the reel-indexing persisted-candidate quality gate. The audit also identified pre-existing application-layer configuration reads in some other AI use cases; those are separate layering cleanup items and are intentionally not mixed into this structural refactor.
