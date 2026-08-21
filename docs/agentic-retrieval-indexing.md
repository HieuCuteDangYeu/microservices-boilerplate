# Bounded agentic retrieval and indexing

This implementation keeps LangGraph and deterministic infrastructure in control while allowing model reasoning only at bounded semantic boundaries. It follows the repository conventions in `QWEN.md`: application behavior lives under `application`, provider and RabbitMQ details stay under `infrastructure`, new cross-boundary dependencies are exposed as domain interfaces and DI tokens, and inter-service communication remains RabbitMQ-only.

## Retrieval architecture

`LangGraphRagChatWorkflowAdapter` keeps its existing graph topology. `RetrievalAgentUseCase` is now only the workflow-facing runtime contract/token. The Nest module supplies `ToolCallingRetrievalAgentUseCase` under that token, so the graph depends on an agent contract rather than accidentally treating the deterministic retrieval implementation as the agent itself.

The tool-calling agent depends on four bounded ports/policies:

- `IRetrievalEngine`: planning, deterministic retrieval, and reranking.
- `IContentService`: already-existing conversation reel access resolution.
- `IToolCallingLlmService`: provider-neutral tool-calling model interface.
- `IRetrievalAgentPolicy`: resolved rollout/model/limit policy with no env parsing inside the use case.

`IRetrievalEngine` now has an explicit application implementation: `DeterministicRetrievalEngine` in `application/services/deterministic-retrieval-engine.service.ts`. This separates deterministic execution from the workflow-facing tool agent without inventing an infrastructure adapter for application orchestration.

The model can call only two high-level tools:

- `search_reel_content`: search reels already authorized for the current conversation.
- `get_reel_context`: focus retrieval on one already-authorized reel.

Both tools delegate through `IRetrievalEngine`, so access control, query embeddings, direct/hierarchical retrieval, reel/section/chunk search, transcript/visual evidence policy, RRF-backed semantic search, neighbour expansion, deduplication, and downstream neural reranking remain deterministic.

Visual retrieval is part of that deterministic engine. When the router requires `VISUAL`, the engine calls `IReelSemanticIndexService.searchVisualScenes(...)` in both direct and hierarchical retrieval. For a visual-only route, transcript chunk search is skipped; mixed evidence routes can retrieve transcript and visual scene candidates together before hydration and reranking.

The model does not receive tools for SQL, pgvector, embeddings, RRF weighting, persistence, or authorization. A tool request can narrow router-approved evidence types but cannot widen them. If the tool loop fails or returns no useful evidence, retrieval falls back through the deterministic engine port.

The Cloudflare implementation lives in `infrastructure/adapters/cloudflare-tool-calling-llm.adapter.ts`; Cloudflare request/response shapes do not leak into the application use case or domain interface.

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

`ConfigService` resolves these values in `AiServiceModule` into `IRetrievalAgentPolicy`; the application use case receives only the policy object. For production, explicitly enable `RAG_TOOL_CALLING_ENABLED=true` only after focused tests and a representative RAG benchmark pass.

## Indexing architecture

`ReelIndexLangGraphWorkflow` remains the deterministic orchestrator and retains its checkpoint graph, transcription workers, visual branch, metadata processing, adaptive sectioning, embedding generation, candidate validation, inactive persistence, and atomic activation behavior.

The existing semantic use cases remain the bounded specialists instead of creating a parallel `application/agents` layer:

- `AnalyzeVisualFrameManifestUseCase`: visual understanding over sampled, verified frame artifacts.
- `ExtractHierarchicalMetadataUseCase`: metadata curation while preserving creator-authored metadata authority.
- `BuildAdaptiveTranscriptSectionsUseCase`: semantic/pause/lexical section boundary selection with the existing quality/fallback path.
- `IndexQualityAgentUseCase`: the new semantic critic before activation.

Only the last role required genuinely new application behavior. `IndexQualityAgentUseCase` depends on:

- `IPersistedSemanticCandidateValidator`: deterministic persisted-candidate integrity gate.
- `IIndexingAiService`: the indexing service's existing AI port, extended with semantic quality review.
- `IIndexQualityAgentPolicy`: resolved enable/enforcement/availability/document-limit policy.

The quality use case always invokes `IPersistedSemanticCandidateValidator` first. If deterministic validation fails, no model review runs. The reviewer executes while the candidate is still inactive and cannot activate documents itself; `CommitSemanticCandidateUseCase` remains the only activation path.

For compatibility with the pre-existing LangGraph constructor, the module supplies the quality use case under the existing `ValidatePersistedSemanticCandidateUseCase` class token, while the new use case itself depends on the string-token validator port.

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

The AI-side `ReviewIndexQualityUseCase` consumes an AI-domain `IndexQualityReviewInput`, not the RMQ DTO. The Cloudflare structured-model dependency remains behind `IStructuredLlmService`.

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

`ConfigService` resolves these values in `ReelIndexingServiceModule` into `IIndexQualityAgentPolicy`; the quality use case contains no environment parsing.

Recommended rollout:

1. In development/staging, leave the default advisory behavior or set `INDEX_QUALITY_AGENT_ENABLED=true` explicitly and inspect reviewer logs.
2. Evaluate false positives on short, long, visual-heavy, silent/no-audio, and multilingual reels.
3. In production, explicitly set `INDEX_QUALITY_AGENT_ENABLED=true` only after validation.
4. Turn on `INDEX_QUALITY_AGENT_ENFORCE=true` only after reviewer quality is acceptable.
5. Keep `INDEX_QUALITY_AGENT_REQUIRED=false` unless indexing should stop whenever the model provider is unavailable.

## Validation

Run the focused tests first:

```bash
pnpm test -- --runInBand \
  apps/ai-service/src/infrastructure/adapters/cloudflare-tool-calling-llm.adapter.spec.ts \
  apps/ai-service/src/application/use-cases/tool-calling-retrieval-agent.use-case.spec.ts \
  apps/ai-service/src/application/services/deterministic-retrieval-engine.service.spec.ts \
  apps/ai-service/src/application/use-cases/review-index-quality.use-case.spec.ts \
  apps/reel-indexing-service/src/application/use-cases/index-quality-agent.use-case.spec.ts
```

Compile the two affected services:

```bash
pnpm build:ai
pnpm build:reel-indexing
```

Run regression tests and the existing retrieval benchmark:

```bash
pnpm test -- --runInBand
pnpm ops:rag:benchmark
```

For an integration smoke test, start the AI and indexing services with RabbitMQ, the normal databases, R2, and Cloudflare credentials available:

```bash
pnpm start:ai
pnpm start:reel-indexing
```

Expected retrieval logs when tool calling is active include `RetrievalToolAgent` entries showing selected tool names and accumulated result counts. Existing `RagGraph` retrieval, reranking, sufficiency, verification, and citation logs should continue afterward.

For indexing, the pre-existing visual/metadata/adaptive-sectioning logs continue unchanged. The new semantic gate adds `IndexQualityAgent` immediately after deterministic persisted-candidate validation and before candidate commit.

## Scope note

The repository already contains some older conventions that are stricter or looser than the prose in `QWEN.md` (for example the legacy `ai-service` controller directory is singular and existing LangGraph constructors inject concrete use-case class tokens). This refactor keeps the existing graph constructor stable but makes that class token an explicit workflow contract, while deterministic retrieval now has its own named implementation behind `IRetrievalEngine`.
