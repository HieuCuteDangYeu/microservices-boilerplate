# GPT-only 2048-token router gate, 2026-08-26

Status: **FAIL — stopped on the first 2048-token truncation.**

The tested code/config SHA is `86654bd2d97906674b63234fa77a7a2d2fcb4ee7`.
The initial clean master checkpoint was `ce39d444d4ea32f44a5a3109af66092ead4be230`;
cached origin/master was `ec02dd6e826d387578a422116ce0699252c11a91`.
No fetch, push, deployment, production configuration edit, runtime semantic
change, or dataset change was performed.

## Locked experiment

`router-gpt2048-v3.json` selects `@cf/openai/gpt-oss-20b`, no fallback,
45000-ms timeout, 2048 completion tokens, and low reasoning effort. Gateway
transport is explicitly disabled for this isolated test, with one attempt per
case. Production same-model Gateway retry resilience was not tested or promoted.
The candidate passed zero-provider parity even with stale inherited settings.

Dataset SHA-256: `a802a570ab3e1aa238854acb0efcb230ca95a03a6231a5eed9385011808f6bed`.
Candidate SHA-256: `b9507ccc0b2a3bec62f707798c029fd7f0fffd5e92a3bae8e44be2a05b1f1aa3`.

Exactly one capacity request returned HTTP 200. The Ragas run is
`router-gpt2048-v3-stress-20260826`; ignored artifacts are in
`eval/rag/results/router-gpt2048-v3-stress-20260826/`:
`observations.json`, `cases.jsonl`, `ragas-experiment.json`, `summary.json`,
and `summary.md`. Observations and the effective configuration were checkpointed
before/after each case. No interrupted case or run was resent.

## Measured stress result

Twelve cases were planned; six were attempted, four completed structurally, and
six were not attempted after the mandatory stop. There were zero timeouts,
zero provider/HTTP failures, one schema failure, one truncation, zero retries,
zero fallback calls, and zero judge calls. Total live calls this stage: seven,
including the single capacity probe. All six router calls returned HTTP 200.

All five deterministic semantic accuracies are 4/6 (66.67%): intent,
reference target, reel question type, required evidence, recommendation action.
This counts both unavailable malformed responses as incorrect; all four valid
responses passed all five metrics. It is not a 12-case or 65-case accuracy.
False normal-chat rate is 0/4 expected reel cases; false reel rate is 0/2
expected non-reel cases. Structural/schema success is 4/6, timeout rate 0/6,
truncation rate 1/6, provider-failure rate 0/6.

| Measure                    |     p50 |    p90 |     p95 |   max |
| -------------------------- | ------: | -----: | ------: | ----: |
| Case latency, ms           | 10281.5 |  27655 |   31165 | 34675 |
| Provider completion tokens |   171.5 | 1129.5 | 1588.75 |  2048 |

Provider-accounted tokens: 7073 input, 2870 output. Router request cost estimate:
USD 0.0022756, excluding the capacity probe. The versioned pricing catalog uses
USD 0.20/M input and USD 0.30/M output, matching the current
[Cloudflare model pricing](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/).
These are provider usage totals, not counts of visible JSON tokens.
Reasoning-token breakdown: **UNAVAILABLE** in retained diagnostics.

## General failure cluster and diagnosis

`STRUCTURED_OUTPUT`: two failures. Other semantic clusters are not established
by malformed responses and must not be inferred from their task/discovery topics.

- The task-action case returned `finish_reason=stop`, 104 completion tokens,
  and failed local schema validation at `$.requiredEvidence`, constraint `type`.
  The schema requires an array. The rejected value was not retained or printed;
  its actual type is unknown. This is not truncation or a timeout.
- The discovery case returned `finish_reason=length`, exactly 2048 completion
  tokens, and 34675-ms case latency. The adapter rejected it before parsing the
  content. The checkpoint recorded `STRUCTURED_COMPLETION_TRUNCATED`, and no
  seventh router call was made.

The request explicitly sent the six-field schema, 2048-token ceiling and low
reasoning setting. Local schema checks are fail-closed. The direct schema shape
matches the example in [Cloudflare JSON Mode documentation](https://developers.cloudflare.com/workers-ai/features/json-mode/),
which warns that requested schema compliance is not guaranteed. This does not
prove endpoint/model-specific constrained decoding or reasoning-setting behavior.

The proven cause of the second failure is completion-budget exhaustion, not
network delay. The exact generation behavior causing exhaustion cannot be
recovered from retained aggregate usage: the adapter preserves neither a
separate reasoning-token count nor the truncated content. Hidden reasoning,
unfinished/repetitive output, or endpoint-specific schema behavior remain
hypotheses, not findings. A six-field target does not constrain internal
generation work. Do not increase the budget or add case-specific repairs on this
evidence. A separately authorized provider-contract/diagnostics investigation is
the next safe step, retaining strict validation and redacted diagnostics.

## Gates and local verification

Full 65-case router, sufficiency, verifier, escalation, deployed frozen AMI,
production smoke and semantic judge gates: **NOT_EVALUATED**, blocked by stress.
No model configuration was promoted; the existing example already has the
requested GPT/empty-fallback/45000/2048 values and was left unchanged.

Passed: 10 Node configuration/checkpoint tests; 31 Python evaluation tests;
29 AI suites / 278 tests (including router, 65 zero-provider cases, diagnostics,
structured adapter, LangGraph and memory regressions); AI build; eight-case
offline Ragas fixture experiment; targeted runtime ESLint; CJS syntax checks;
Prettier; Ruff; `git diff --check`. Offline fixture results are tooling checks,
not a live frozen AMI gate. CJS files are intentionally excluded from repository
ESLint; forcing inclusion fails its TypeScript project configuration. No shared
runtime source changed, so build-all was not required.

Static runtime audit found zero benchmark-specific rules, case-specific rules,
manual intent keyword routing, manual fact/relation dictionaries, manual
semantic citation overrides, or arbitrary answer sliding windows. Inspected
router, grounded revision, citation, verifier and graph paths remain unchanged.
Reel indexing and AI memory sources are verified unchanged from the starting
checkpoint; no new live indexing or memory readiness claim is made.

The final secret scan found zero matches in tracked content, diff, local-only
commit history, evaluation artifacts, or AMI reports. Exposed GitHub credential
revocation/rotation is **UNVERIFIED**, so remote writes remain blocked. No
credential values were printed. Local reporting commits do not authorize push.
