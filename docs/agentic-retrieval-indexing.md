# Bounded agentic retrieval and indexing

This implementation keeps LangGraph and deterministic infrastructure in control while allowing semantic specialists to use model reasoning at bounded boundaries.

## Retrieval architecture

`LangGraphRagChatWorkflowAdapter` keeps its existing graph topology. Its `RetrievalAgentUseCase` dependency is provided by `ToolCallingRetrievalAgentUseCase`, which adds a bounded model-to-tool loop before delegating every search to the existing retrieval engine.

The model can call only two high-level tools:

- `search_reel_content`: search reels already authorized for the current conversation.
- `get_reel_context`: focus retrieval on one already-authorized reel.

Both tools delegate to the existing `RetrievalAgentUseCase.retrieve()` implementation, so access control, query embeddings, direct/hierarchical retrieval, reel/section/chunk search, transcript/visual evidence policy, RRF-backed semantic search, neighbour expansion, deduplication, and the existing downstream neural reranker remain deterministic.

The model does not receive tools for SQL, pgvector, embeddings, RRF weighting, persistence, or authorization. A tool request can narrow router-approved evidence types but cannot widen them. If the tool loop fails or returns no useful evidence, retrieval falls back to the pre-existing deterministic plan.

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

For production, explicitly enable `RAG_TOOL_CALLING_ENABLED=true` only after focused tests and a representative RAG benchmark pass.

## Indexing architecture

`ReelIndexLangGraphWorkflow` remains the deterministic orchestrator and retains its checkpoint graph, transcription workers, embedding generation, candidate validation, inactive persistence, and atomic activation behavior.

Semantic node dependencies are provided through bounded specialist classes:

- `AnalyzeVisualFrameManifestUseCase` -> `VisualUnderstandingAgentUseCase`
- `ExtractHierarchicalMetadataUseCase` -> `MetadataCuratorAgentUseCase`
- `BuildAdaptiveTranscriptSectionsUseCase` -> `SectioningAgentUseCase`
- `ValidatePersistedSemanticCandidateUseCase` -> `IndexQualityAgentUseCase`

This preserves existing checkpoint and retry semantics while making semantic responsibilities explicit.

The final `IndexQualityAgentUseCase` always runs the deterministic persisted-candidate integrity validator first. Its semantic review happens while the candidate is still inactive. It cannot activate documents itself; `CommitSemanticCandidateUseCase` remains the only activation path.

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
  apps/ai-service/src/application/use-cases/review-index-quality.use-case.spec.ts \
  apps/reel-indexing-service/src/application/agents/index-quality-agent.use-case.spec.ts
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

Expected indexing logs include `VisualUnderstandingAgent`, `MetadataCuratorAgent` when metadata needs enrichment, `SectioningAgent` for long-reel semantic sectioning when that path runs, and `IndexQualityAgent` immediately before candidate commit.
