# GPT-OSS router provider-contract investigation

Verified 2026-08-26. Starting branch `master`, clean HEAD
`7472529912bde9747d2764f35a0738872c9d526a`. GitHub credential revocation remains
unverified; no authenticated GitHub operations or deployment are authorized.

## Capability evidence and limits

The authenticated, read-only [model-schema API](https://developers.cloudflare.com/api/resources/ai/subresources/models/subresources/schema/methods/get/)
returned HTTP 200 for `@cf/openai/gpt-oss-20b`. The normalized sibling file
`gpt-oss-20b-capabilities-20260826.json` preserves only schema parameter paths,
types, enums and required flags. No credentials, descriptions, examples or raw
response bodies are persisted. There are 83 input entries and 3 output entries;
the output alternatives are opaque object/string schemas, not a detailed
generation-response contract. Required flags apply within each schema branch.

| Mechanism/parameter                                      | Official evidence                                                          | Investigation decision                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `response_format.type=json_schema` and `json_schema`     | Live schema's prompt/messages branches; model page lists `response_format` | Current chat JSON-schema baseline eligible                                       |
| `guided_json`                                            | Absent from live schema and inspected model docs                           | Do not send                                                                      |
| Typed `tools` (flat and nested function forms)           | Live messages schema; model page confirms function calling                 | One nested `route_message` tool eligible                                         |
| `tool_choice`                                            | Absent from live schema; no model-specific official support established    | Omit; strongly constrain via single tool and its description                     |
| `reasoning_effort` on chat                               | Not in live schema; existing requests accepted it                          | `UNDOCUMENTED_BUT_ACCEPTED`, not proof of effect                                 |
| `reasoning.effort`                                       | Responses-input branch enum: low, medium, high                             | Supported for that branch, not proof of chat mapping                             |
| Native messages `max_tokens`                             | Live schema and model page                                                 | Documented native completion limit                                               |
| Chat `max_completion_tokens`                             | Existing application wire contract, accepted in measured runs              | Retain 2048; do not claim the native schema explicitly documents this chat alias |
| Responses `max_output_tokens` / structured `text.format` | Not established by fetched model schema or inspected GPT-OSS docs          | No Responses structured variant                                                  |

The [model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/)
confirms reasoning and function calling, and links to the compatible endpoints.
The [JSON Mode documentation](https://developers.cloudflare.com/workers-ai/features/json-mode/)
shows the direct schema payload and warns that schema compliance is not
guaranteed. Its supported-model list omits GPT-OSS, but the live model schema
explicitly advertises `response_format`. These are evidence of accepted input
mechanisms, not equivalent guarantees across endpoints.

[Cloudflare's GPT-OSS announcement](https://developers.cloudflare.com/changelog/post/2025-08-05-openai-open-models/)
documents Responses-style input/output through native `/ai/run` and
`/ai/v1/responses`, including `reasoning.effort`. It does not establish a
Responses structured-output format/budget combination for this investigation.
[Compatible endpoint documentation](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
establishes chat transport, not every OpenAI parameter on every model.
The [traditional function-calling example](https://developers.cloudflare.com/workers-ai/features/function-calling/traditional/)
documents typed arguments. The adapter accepts either a serialized JSON argument
object or an already typed object and validates the same schema; it does not
coerce fields, recover JSON from prose, execute the tool, or accept unrelated
tool names/multiple calls.

Native JSON-schema is supported as an input shape, but no stronger documented
mechanism than the existing schema was found; skip it per the investigation
rule. Responses structured output is NOT_SUPPORTED for this experiment because
support is not established, rather than asserting the service must reject it.
No undocumented `strict`, `guided_json`, `tool_choice`, `parallel_tool_calls`,
Responses formatting parameter, or new reasoning parameter is introduced.
The existing accepted chat `reasoning_effort=low` is retained for parity in both
variants without claiming it controls reasoning.

## Predeclared bounded evaluation

Two versioned candidates: `router-contract-chat-json-schema-v1.json` and
`router-contract-tool-call-v1.json`. Both use the same production
`router-semantic-v2` system/user prompts, six-field schema, labels, GPT-OSS-20B,
45000-ms deadline, and 2048 completion budget. Both disable fallback, Gateway,
cache, retries and judge calls. Only the output transport differs. The tool
description constrains its sole output purpose, never application task authority.

The four initial cases are `task-01`, `implicit-01`, `discovery-01`, `memory-02`.
Each variant runs exactly four once, even after malformed/truncated responses;
account limitation stops all further requests. Maximum initial model requests:
eight (within the authorized twelve), plus one read-only schema fetch and no
capacity probe. No frozen cases. Ragas scores all five deterministic dimensions;
every case is checkpointed with its effective config before any next request.

A winner requires four structural and semantic passes with no truncation,
schema/type failure, timeout or provider failure. Only then may eight disjoint
additional cases run on one winner. The additional and full runs stop at their
first structural failure. A fresh 65-case run is permitted only after 12/12
structural validation. No same-run repair/retry or token increase.

The experimental tool transport is opt-in via an infrastructure-only router
configuration selector; the default and all other roles remain JSON-schema.
`QueryRouterAgentUseCase`, domain decisions and LangGraph business logic do not
receive provider tool structures. The existing `IStructuredLlmService` port is
unchanged apart from optional safe diagnostic metadata. Neither `.env.example`
nor production/ignored env files are modified; no transport is promoted here.

Safe diagnostics add schema-owned expected type, actual JSON type (never its
value), endpoint contract label, content JSON type/presence, tool-call presence,
and numeric reasoning-token usage only when actually supplied. Truncated content
and reasoning text are not persisted. Missing breakdown remains UNAVAILABLE.

## Measured outcome

All runs used tested SHA `67de797ede4d9163feda3946048575b36bb8f555` with a clean
worktree. Their Ragas artifacts are in `eval/rag/results/<run-id>/`, including
incremental `observations.json`, `cases.jsonl`, `ragas-experiment.json`, and
`summary.json`. No prior observations were substituted or discarded.

| Stage / run ID                                            | HTTP 200 |                  Structural | All five semantic metrics | Schema failures | Truncations | Timeouts |  p50 ms | max ms | Input tokens | Output tokens |  Cost USD |
| --------------------------------------------------------- | -------: | --------------------------: | ------------------------- | --------------: | ----------: | -------: | ------: | -----: | -----------: | ------------: | --------: |
| `router-contract-chat-json-schema-v1-20260826`            |      4/4 |                         4/4 | Each 4/4                  |               0 |           0 |        0 | 10954.5 |  17866 |         4714 |           658 | 0.0011402 |
| `router-contract-tool-call-v1-20260826`                   |      4/4 |                         0/4 | Each 0/4 usable decisions |               4 |           0 |        0 |    1853 |   2694 |         5774 |           588 | 0.0013312 |
| `router-contract-chat-json-schema-v1-additional-20260826` |      8/8 |                         8/8 | Each 8/8                  |               0 |           0 |        0 | 10461.5 |  26425 |         9445 |          1346 | 0.0022928 |
| `router-contract-chat-json-schema-v1-full65-20260826`     |      1/1 | 0/1 attempted; 0/65 planned | Each 0/1 attempted        |               0 |           1 |        0 |   29588 |  29588 |         1180 |          2048 | 0.0008504 |

All five metrics are intent, reference target, reel question type, required
evidence, and recommendation action. Unusable responses count as wrong; zero
usable tool decisions does not prove the discarded message text was semantically
wrong. Provider/HTTP failures, retries, fallback calls and judge calls were zero
throughout. Initial model requests: eight. Total model requests: **17**. Total
input/output tokens: **21113 / 4640**. Total model cost estimate: **USD 0.0056146**,
using the versioned catalog and published model rates. One schema GET was made,
with zero capacity probes. Reasoning-token breakdown was unavailable in every
retained response; no hidden reasoning count is estimated.

### Selection and rejection

JSON-schema was the sole four-case winner, selected before follow-up in the
ignored artifact `eval/rag/results/router-contract-selection-20260826.json`.
The tool variant was faster but ineligible: all four responses had
`finish_reason=stop`, content type `string`, content present, and no tool calls.
The adapter reported schema path `$.tool_calls`, constraint `singleRouteTool`.
The identical semantic prompt requests JSON output; without a documented forced
tool setting, offering a single tool did not produce the required transport in
these cases. No text recovery or prompt repair was attempted. This is not proof
that all GPT-OSS function calling is unsupported, only rejection of this tested
single-tool contract under the required shared instructions.

JSON-schema then passed all eight disjoint additional cases, yielding the
required **12/12 structural and semantic gate**. A fresh 65-case run was therefore
started; its **first** case, `explicit-01`, returned HTTP 200 and
`finish_reason=length`, with exactly 2048 completion tokens in 29588 ms. Safe
diagnostics showed `responseContentType=null`, `contentPresent=false`, and
`toolCallsPresent=false`. No usable answer content was returned. The runner
persisted `STRUCTURED_COMPLETION_TRUNCATED` and stopped with `STRUCTURAL_FAILURE`.
The remaining **64 cases were never requested**.

For the partial full run: structural success 0/1, schema/type failure 0/1,
truncation 1/1, timeout 0/1, provider failure 0/1. P50/P95/max are all 29588 ms
because only one sample exists, not evidence of a 65-case latency distribution.
All five semantic scores are 0/1 unavailable decisions, not 0/65. False normal
chat is 0/1 expected-reel case; false reel is NOT_EVALUATED (zero non-reel cases).

The same generic case had just passed the additional run with 167 completion
tokens. Source, candidate hash, prompt/schema meaning and settings were unchanged.
The new failure proves that a small pass did not establish stable structural
reliability. The failure cannot be explained as an oversized visible JSON object:
the returned content was null. Completion exhaustion without output is observed;
internal reasoning behavior remains unproven without a provider breakdown.
Chat `reasoning_effort=low` being accepted is still not proof of its effect.

**Final router generic gate: FAIL. No provider contract was promoted.** Keep the
2048 ceiling and default runtime transport unchanged; do not retry, reenable GLM,
repair individual cases, or run any downstream provider stage in this cycle.
Sufficiency, verifier, escalation, production smoke, frozen live AMI and judge
stages remain NOT_EVALUATED. A separate router-model/contract architecture
evaluation requires new authorization.

## Final local checks and security

Passed: 30 AI suites / 295 tests (including router, all 65 zero-provider generic
cases, adapter, safe diagnostics and graph tests), 13 Node bridge/config/stop
tests, 31 Python evaluation tests, AI build, targeted ESLint, Prettier, Ruff and
`git diff --check`. CJS scripts remain excluded by repository ESLint and are
checked by syntax/tests/Prettier. No shared library changes require build-all.

The static audit found zero benchmark-specific runtime rules, case-specific
runtime rules, manual intent keyword routing, manual fact/relation dictionaries,
manual semantic citation overrides, and arbitrary answer sliding windows.
Application/router/graph code, indexing source, memory source, datasets and
example/production configurations are unchanged from the starting checkpoint.
Readiness flags mean verified unchanged, not newly live-tested indexing/memory.

Credential revocation/rotation remains UNVERIFIED. Local secret audits found no
matches in tracked content, diff, local-only history or saved reports. No old/new
credential values were printed. No fetch, push, deployment or remote write was
performed. Local reporting commits do not authorize those actions.
