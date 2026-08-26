# Router semantic contract v2

The model chooses intent, reference target, reel question type, evidence modalities,
recommendation action, and a concise reason. It does not emit four mechanical
flags. The application derives retrieval, memory, conversation-summary and
verification flags from intent, retaining the downstream route interface.

Read-only in-app discovery is `NORMAL_CHAT` plus `RECOMMEND_REELS` or
`SUGGEST_QUERIES`. The graph's recommendation branch calls public reel search with
the viewer identity or returns suggested queries; it does not execute external
state-changing tools. `TASK_ACTION_REQUEST` identifies requested external
operations/state changes; classification never authorizes execution. The generic
discovery labels remain unchanged. Recommendation action type labels are now
explicit on every router row; questions and frozen AMI expectations are unchanged.
The generic dataset content hash and `routerContractVersion` identify the label
augmentation. Older artifacts retain their original hashes and observations.

Provider schema validation remains strict. Intent/reference, reel type/evidence,
and action/intent contradictions are rejected, with at most one configured
secondary semantic call. No fallback means typed `ROUTER_UNAVAILABLE`, never
implicit normal chat. The existing recent-share secondary-classification policy
remains unchanged; it does not force a reel route.

Recommendation result count is application policy (2), and the nested duplicate
reason is no longer generated. Query, discovery type, personalization permission,
and suggested queries remain model decisions. Public recommendation objects keep
their existing shape. The schema is identified as `router-semantic-v2` in adapter
diagnostics. The bridge persists errorCode, schemaPath, schemaConstraint/constraint,
and schemaVersion without response bodies or rejected values.
Unexpected provider property names are also untrusted: `additionalProperties`
diagnostics now contain only the schema-owned parent path. A synthetic regression
failed before this change and passes afterward, checking errors, diagnostics and
logs. Schema validation still rejects the same malformed object.

The prior normal-01 schema path/constraint/version cannot be recovered from saved
artifacts: normalization dropped them and the Python bridge discarded child log
output. Do not infer a missing field or claim that this repair reproduces that
specific provider defect. The proven issues are lost observability, redundant
generated flags, an overly broad task definition, and silently rewritten
contradictory semantic fields.

Prior successful GPT output tokens: 154, 188, 201, 234, 253 (p50 201, p95 249.2).
Use 768 for the repaired GPT harness, leaving headroom over observed output.
Prior successful GLM output: 870, 1456, 1517, 1542 (p50 1486.5). Retain 2048 for
GLM instead of assuming its reasoning tokens fit GPT's budget. Fallback timeout
remains 60000 ms, never higher. New budgets are experimental until live gates pass.

After offline checks and one capacity request, run GPT's six-case harness first.
Only a structural and semantic pass allows expansion. GLM gets only two prior
timeout cases at 60s, then (if both complete) two semantic cases. Each isolated
run disables secondary models and uses the direct provider; overrides are saved.
Use the versioned subset IDs, not prefix limits. All calibration runs remain
separate from full experiments; do not resend a run ID after interruption.

Security status: the former environment-object assertion is already replaced by
a boolean-only assertion. Synthetic failure checks show environment values no
longer enter assertion diagnostics. Credential rotation cannot be inferred from
source; authenticated GitHub operations and deployment remain blocked until the
exposed credential is verifiably revoked or rotated.

## Bounded live outcome (2026-08-26)

The GPT six-case harness passed all five deterministic dimensions. The additional
ten-case GPT run completed nine valid responses; one exhausted 768 tokens and was
rejected as truncated. Thus 768 is not a production-validated budget; retain the
existing runtime token default pending a separately bounded budget experiment.
No 65-case primary gate or downstream evaluation was executed.

At the actual 60000-ms ceiling GLM returned both HTTP responses, but one exhausted
2048 tokens and was rejected as truncated. This is an output-budget/structural
failure, not a 60-second timeout failure. Stop GLM expansion; `.env.example`
disables the semantic fallback. Ignored local env and deployment are unchanged.
The experimental JSON preserves the exact pre-run candidate and overrides rather
than retroactively rewriting the tested snapshot.
