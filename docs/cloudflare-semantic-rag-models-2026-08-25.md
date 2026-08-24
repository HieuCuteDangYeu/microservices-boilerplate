# Cloudflare semantic indexing and RAG model decision

Research date: 2026-08-25. Sources are current official Cloudflare documentation only.

## Decision

| Role | Model | Official evidence used |
| --- | --- | --- |
| ASR | `@cf/openai/whisper-large-v3-turbo` | Cloudflare-hosted, batch-capable ASR/translation; $0.00051/audio minute; supports language auto-detection, VAD and timestamped segments. |
| Embedding | `@cf/baai/bge-m3` | Multilingual retrieval model; 1,024 dimensions, 512 input tokens, cosine; $0.012/M input tokens. |
| Reranking | `@cf/baai/bge-reranker-base` | Dedicated query/context similarity model; 512 input tokens; $0.0031/M input tokens. |
| Router/planner/tools/metadata/summaries | `@cf/zai-org/glm-4.7-flash` | Multilingual across 100+ languages, function calling and reasoning, 131,072-token context; $0.06/M input and $0.40/M output tokens. |
| Vision | `@cf/meta/llama-4-scout-17b-16e-instruct` | Current hosted native multimodal MoE with function calling, 131K context and explicit guided JSON support; $0.27/M input and $0.85/M output tokens. A live synthetic image/JSON-object smoke passed. |
| Answer/revision | `@cf/zai-org/glm-4.7-flash` / `@cf/openai/gpt-oss-20b` | Live synthetic schema smoke on 2026-08-25 showed strict structured JSON for these roles. Gemma 4 text-only and vision schema smokes did not consistently return the required strict local shape, so it was not selected. |
| Sufficiency/citation/index/verifier | `@cf/openai/gpt-oss-20b` | Lower-latency reasoning and function calling, 128K context; $0.20/M input and $0.30/M output tokens. |
| Escalated verifier | `@cf/openai/gpt-oss-120b` | General-purpose high-reasoning model, 128K context; $0.35/M input and $0.75/M output tokens. |

The current catalog marks these models available and not deprecated. Cloudflare's 2026 deprecation guidance explicitly recommends GLM-4.7-Flash and Gemma 4 as replacements for retired Llama/Gemma models.

## Provider constraints encoded in the implementation

- Text semantic roles use `response_format: { type: "json_schema" }`; Llama 4 Scout vision uses JSON-object mode with the same strict local field/type validation. Cloudflare documents that structured mode can still fail to meet the schema and does not support streaming.
- AI Gateway is selected with `cf-aig-gateway-id`. Every private RAG/index request sends `cf-aig-skip-cache: true`; response caching is never enabled for user or conversation content.
- Optional prefix-cache affinity uses a one-way hash, never a raw user token or secret.
- BGE-M3 document and query vectors share the same model, 1,024 dimensions and explicit `cf-bge-m3-v1` identity. The database migration adds a separate 1,024-dimension column so active 384-dimension indexes remain readable until an explicit reindex and atomic activation.
- Reranker input is structurally truncated to at most 512 tokens; exact stored evidence is not truncated.

## Official sources

- <https://developers.cloudflare.com/workers-ai/models/>
- <https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/>
- <https://developers.cloudflare.com/workers-ai/models/bge-m3/>
- <https://developers.cloudflare.com/ai-search/configuration/models/supported-models/>
- <https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/>
- <https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/>
- <https://developers.cloudflare.com/ai/models/%40cf/google/gemma-4-26b-a4b-it/>
- <https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/>
- <https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/>
- <https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/>
- <https://developers.cloudflare.com/workers-ai/features/json-mode/>
- <https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/>
- <https://developers.cloudflare.com/ai-gateway/features/caching/>
- <https://developers.cloudflare.com/workers-ai/features/prompt-caching/>
- <https://developers.cloudflare.com/workers-ai/platform/pricing/>

## Node-by-node implementation audit

The tables below enumerate the actual nodes registered by the two LangGraph workflows on the research date. “Structural” means the node may validate shape, authorization, identity, bounds, ordering, or provenance but may not interpret English meaning.

### ReelIndexLangGraphWorkflow

| Node | Responsibility | Current decision method | Current model | Hard-coded semantics | Target method | Target model or algorithm | Failure policy | Config | Tests/status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load_or_resume_attempt | Load durable attempt/checkpoints | deterministic repository state | none | none | unchanged | attempt identity/checkpoint algorithm | fail job | queue/checkpoint config | covered/pass |
| validate_and_classify | Validate job and media class | deterministic shape/duration/orientation | none | none | unchanged | structural classifier | fail job | index limits | covered/pass |
| analyze_visual_frames | Produce sampled visual evidence | multimodal provider | Llama 4 Scout | none | structured multimodal JSON plus local validation | `AI_VISION_MODEL` | individual frame failure recorded; no invented caption | vision model/version/timeout | covered/pass |
| build_metadata_only_index | Handle media without usable speech | deterministic branch | none | none | unchanged | structural branch | retain authorized metadata only | index versions | covered/pass |
| transcribe_short_video | Transcribe short media | hosted ASR | Whisper large v3 turbo | none | versioned ASR | `AI_TRANSCRIPTION_MODEL` | fail transcription; never fabricate text | transcription model/version | covered/pass |
| load_audio_manifest | Load long-media audio artifacts | deterministic storage manifest | none | none | unchanged | artifact identity checks | fail missing/unauthorized artifacts | manifest config | covered/pass |
| transcribe_pending_segments | Resume bounded long ASR work | hosted ASR plus checkpoints | Whisper large v3 turbo | none | versioned ASR/checkpoints | `AI_TRANSCRIPTION_MODEL` | segment failure/checkpoint; bounded retry outside model | concurrency/model/version | covered/pass |
| merge_transcript_segments | Merge overlaps | token/provenance algorithm | none | none | unchanged | monotonic overlap merge | reject malformed segments | none | covered/pass |
| validate_transcript | Validate ASR result | structural evidence checks | none | none | unchanged | timestamps/text/source identity | refuse invalid transcript | thresholds | covered/pass |
| evidence_ready_join | Join visual/transcript branches | graph barrier | none | none | unchanged | graph state join | wait for registered parents only | none | graph covered/pass |
| evaluate_metadata_quality | Decide if extraction is needed | completeness/shape policy | none | none | unchanged | structural completeness | preserve existing metadata | metadata limits | covered/pass |
| preserve_user_metadata | Keep creator/user fields authoritative | deterministic precedence | none | none | unchanged | source-authority precedence | never overwrite authoritative fields | none | covered/pass |
| extract_hierarchical_metadata | Generate missing semantic metadata | structured model | GLM 4.7 Flash | none | schema-validated extraction | `AI_METADATA_EXTRACTION_MODEL` | preserve existing fields; fail/omit derived fields | model/timeout | covered/pass |
| choose_chunking_strategy | Select short/long structural path | duration/media class | none | none | unchanged | bounded structural branch | fail invalid class | chunk thresholds | covered/pass |
| build_metadata_document | Create metadata evidence document | deterministic mapping | none | none | unchanged | exact metadata provenance | omit absent fields | version config | covered/pass |
| build_short_evidence_chunks | Create timestamped short chunks | token/time bounds | none | none | unchanged | structural chunking | reject invalid bounds | chunk sizes | covered/pass |
| detect_long_sections | Detect semantic boundaries | embeddings plus pause/duration/lexical signal | BGE-M3 | no vocabulary list | multilingual similarity algorithm | legacy structural sections when disabled; no semantic regex | section weights/thresholds | covered/pass |
| section_quality_gate | Validate section topology | deterministic | none | none | unchanged | continuity/duration/coverage | reject invalid topology | duration bounds | covered/pass |
| build_long_evidence_chunks | Create long-form evidence chunks | section/time/token bounds | none | none | unchanged | structural chunking | reject invalid bounds | chunk sizes | covered/pass |
| validate_document_tokens | Enforce provider input bound | token count service | BGE-M3 tokenizer approximation/API | none | bounded input validation | embedding service | reject oversized document | document max tokens | covered/pass |
| generate_missing_embeddings | Reuse cache or embed | versioned provider call | BGE-M3 | none | model/dimension/version identity | `AI_EMBEDDING_MODEL` | fail candidate; never mix vectors | model/dim/version/concurrency | covered/pass |
| embedding_quality_gate | Check count/dimension/finite values | deterministic | none | none | unchanged | vector identity and numeric validation | reject candidate | embedding identity | covered/pass |
| validate_index_candidate | Validate provenance graph | deterministic | none | none | unchanged | IDs/hashes/source containment | reject candidate | index versions | covered/pass |
| persist_semantic_candidate | Persist inactive candidate | atomic DB transaction | none | none | dual-column version-aware write | PostgreSQL/pgvector | rollback transaction | migration/schema | covered/pass |
| persisted_candidate_integrity_gate | Read/assess persisted candidate | structural plus advisory semantic judge | GPT-OSS 20B | none | schema-validated advisory quality | `AI_INDEX_QUALITY_MODEL` | structural failures hard; semantic policy bounded | model/quality policy | covered/pass |
| commit_semantic_candidate | Promote complete candidate | atomic transaction | none | none | unchanged | deactivate/activate/status in one transaction | rollback; old active index remains | none | atomicity test/pass |

### LangGraphRagChatWorkflowAdapter

| Node | Responsibility | Current decision method | Current model | Hard-coded semantics | Target method | Target model or algorithm | Failure policy | Config | Tests/status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| resolveSharedReelScopeNode | Resolve authorized reel scope | content-service authorization | none | none | unchanged | deterministic access port | empty scope; never widen | service timeout | covered/pass |
| queryRouterNode | Classify intent/modality | structured semantic model | GLM 4.7 Flash | removed keyword routing | schema output plus invariant normalization | `AI_ROUTER_MODEL` | safe normal-chat route | model/timeout | multilingual/novel wording/pass |
| retrievalPlannerNode | Plan bounded queries | structured semantic model | GLM 4.7 Flash | removed lexical fallback | schema plan | `AI_RETRIEVAL_PLANNER_MODEL` | mode NONE/fail closed | model/timeout/limits | covered/pass |
| retrievalNode | Execute scoped hybrid/vector search | versioned embeddings plus access filters | BGE-M3 | none | same model/version as documents | BGE-M3 plus pgvector/FTS | empty result; scope fixed before calls | model/version/limits | access-scope test/pass |
| neuralRerankerNode | Rerank semantic candidates | dedicated cross encoder | BGE reranker base | no generative ranking prompt | bounded 512-token view | `AI_RERANKER_MODEL` | deterministic token-overlap fallback, never semantic authority | model/input/timeouts | success/failure/pass |
| contextSufficiencyNode | Judge whether evidence answers question | structured semantic judge | GPT-OSS 20B | removed question/number/relation regex | stable evidence-ID judgment | `AI_CONTEXT_SUFFICIENCY_MODEL` | exact structural checks then fail closed | model/timeout | novel relation/provider failure/pass |
| retrievalRepairNode | Rewrite a failed query once | structured semantic model | GLM 4.7 Flash | none | bounded rewrite | planner model | retain original query after existing semantic plan | retry/model | covered/pass |
| markRetrievalReadyNode | Mark branch complete | graph state | none | none | unchanged | structural state | no semantic decision | none | graph covered/pass |
| memorySelectorNode | Select allowed memory sources | route/state policy | none | none | unchanged | typed route and authorization policy | omit unavailable memory | memory limits | covered/pass |
| answerContextJoinNode | Join memory/retrieval branches | graph barrier | none | none | unchanged | graph state join | registered parents only | none | graph covered/pass |
| draftAnswerNode | Draft answer and claims | structured semantic generation | GLM 4.7 Flash / GPT-OSS 20B revision | removed arbitrary substring/window answer | answer plus claim/evidence mappings | `AI_ANSWER_MODEL`; revision role when needed | reject empty/unknown/unmapped reel claims | model/timeout/revision bound | generalization/pass |
| verifierNode | Verify relations and grounding | primary plus bounded escalation | GPT-OSS 20B/120B | removed direct-support override | structured claim/evidence judgment | verifier roles | exact-span only on outage, otherwise fail closed | models/timeouts/max attempts | pass |
| prepareAnswerRevisionNode | Schedule one verifier revision | numeric graph state | none | none | unchanged | bounded counter | terminal refusal at limit | max revisions | pass |
| citationNode | Attribute every factual claim | structured semantic attribution | GPT-OSS 20B | removed deterministic coverage upgrade | claim-to-evidence IDs plus quote provenance | `AI_CITATION_ATTRIBUTION_MODEL` | coverage 0 on provider error | model/timeout/limit | pass |
| prepareCitationRevisionNode | Schedule one citation repair | numeric graph state | none | none | unchanged | bounded counter | terminal refusal at limit | max citation retries | pass |
| verificationFailureNode | Produce safe terminal refusal | deterministic state | none | fixed safety response only | unchanged | explicit failure source | no factual answer/citations | none | pass |
| noContextAnswerNode | Produce modality-aware safe refusal | deterministic route modality | none | enum-specific safety copy only | unchanged | required-evidence enum | no guessing | none | pass |
| finalAnswerNode | Publish verified draft | no semantic rewrite | none | none | publish existing verified text | bounded token chunking | preserve terminal source | publisher config | pass |
| reelRecommendationNode | Optional public discovery branch | route action plus content APIs | router GLM upstream | none | semantic route action, deterministic dedupe | router/content service | fail open with no recommendations | limits | covered/pass |
| finalJoinNode | Join answer/recommendation branches | graph barrier | none | none | unchanged | graph state join | registered parents only | none | graph covered/pass |

## Runtime semantic hard-coding audit

| Production source | Rule/purpose | Classification | Action |
| --- | --- | --- | --- |
| `query-router-agent.use-case.ts` | enum sets and evidence-by-route invariants | structural contract validation | retained; no English keyword routing |
| `check-context-sufficiency.use-case.ts` | required/available modality membership | authorization/structural evidence validation | retained; semantic support delegated to model |
| `exact-evidence-provenance.ts` | Unicode tokenization and exact contiguous source span | provenance-only outage fallback | retained; no synonyms, relations, units, stop words, or question interpretation |
| `build-short-evidence-chunks.use-case.ts` and transcript merge | whitespace/token boundaries and monotonic overlap | structural chunking/provenance | retained |
| `build-adaptive-transcript-sections.use-case.ts` | multilingual token-set similarity combined with embedding/pause/duration | language-neutral numeric boundary feature | retained; no vocabulary dictionary |
| `update-conversation-memory.use-case.ts` | strips literal `summary` presentation prefix | output-format cleanup | retained; cannot determine semantic routing/support |
| user-memory retrieval/upsert use cases | normalized containment/token similarity for dedupe and cheap candidate ordering | bounded retrieval/dedupe, not RAG answer authority | retained; semantic extraction remains model-owned |
| `simple-reranker.adapter.ts` | Unicode token overlap | deterministic provider-outage ordering fallback | retained; cannot establish sufficiency, answer truth, verification, or citation coverage |
| metadata/text normalization helpers | whitespace, hashtag marker, length caps | serialization/safety | retained |

Audit counters: benchmark-specific runtime rules `0`; case-specific runtime rules `0`; manual intent keyword routing `0`; manual fact-relation dictionaries `0`; manual semantic citation override `0`.

## Versioned reindex operation

`pnpm run ops:reindex:reel -- <reelId>` now sends the request through `reel_index_query` and includes `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`, and `AI_EMBEDDING_VERSION`. The indexing worker rejects the request before forwarding it to Content Service unless the requested identity exactly matches the worker. This tool was not run; production reindexing requires separate authorization after deployment and migration.
