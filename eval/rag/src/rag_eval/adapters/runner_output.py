"""Normalize the TypeScript exactly-once runner's completed/reconciled rows."""

import json
import re
import subprocess
from pathlib import Path
from typing import Any

from rag_eval.schemas import EvaluationRow, NormalizedExecutionResult

REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
RUNNER = REPOSITORY_ROOT / "scripts/ops/run-existing-ami-rag-retest.cjs"

_DATABASE_URL_RE = re.compile(
    r"\b(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s\"']+", re.IGNORECASE
)
_BEARER_RE = re.compile(r"\bBearer\s+[^\s,;]+", re.IGNORECASE)
_COOKIE_HEADER_RE = re.compile(
    r"(?im)(\b(?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]*?"
    r"(?=\s+[A-Za-z][A-Za-z_-]*\s*[:=]|\s*$)"
)
_SENSITIVE_VALUE_RE = re.compile(
    r"(?ix)("
    r"(?:\"|')?(?:authorization|proxy-authorization|password|secret|token|"
    r"access[_-]?token|refresh[_-]?token|api[_-]?key|database[_-]?url|"
    r"cloudflare[_-]?api[_-]?token|content[_-]?database[_-]?url|"
    r"reel[_-]?indexing[_-]?database[_-]?url)(?:\"|')?"
    r"\s*[:=]\s*"
    r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}\]]+)"
    r")"
)


def load_json(path: Path) -> Any:
    """Load one JSON document and preserve a useful parse location on failure."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(
            f"{path}: invalid JSON at line {error.lineno}, column {error.colno}: {error.msg}"
        ) from error


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Load one JSON object per non-empty line, including its source line on failure."""

    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"{path}: invalid JSONL at line {line_number}, column {error.colno}: {error.msg}"
            ) from error
        if not isinstance(value, dict):
            raise ValueError(
                f"{path}: invalid JSONL at line {line_number}: expected a JSON object"
            )
        rows.append(value)
    return rows


def load_json_or_jsonl(path: Path) -> list[dict[str, Any]]:
    """Accept the historical JSON-array trace file and the canonical JSONL form."""

    try:
        value = load_json(path)
    except ValueError:
        return load_jsonl(path)
    if isinstance(value, list):
        if not all(isinstance(item, dict) for item in value):
            raise ValueError(f"{path}: JSON trace array must contain only objects")
        return value
    if isinstance(value, dict):
        return [value]
    raise ValueError(f"{path}: expected a JSON object, array, or JSONL object rows")


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _route_from_trace(trace: dict[str, Any]) -> dict[str, Any]:
    metrics = _object(trace.get("workflowMetrics"))
    diagnostics = _object(metrics.get("diagnostics"))
    persisted = (
        _object(trace.get("routeDecision"))
        or _object(metrics.get("routeDecision"))
        or _object(diagnostics.get("routeDecision"))
    )
    legacy = _object(trace.get("route"))
    if not any(
        key in legacy
        for key in (
            "intent",
            "referenceTarget",
            "reelQuestionType",
            "requiredEvidence",
            "needsRetrieval",
            "needsVerification",
            "recommendationActionType",
        )
    ):
        legacy = {
            key: trace[key]
            for key in (
                "intent",
                "referenceTarget",
                "reelQuestionType",
                "requiredEvidence",
                "needsRetrieval",
                "needsVerification",
                "recommendationActionType",
            )
            if key in trace
        }
    route = persisted or legacy

    actual = {
        "intent": route.get("intent", trace.get("intent")),
        "referenceTarget": route.get("referenceTarget"),
        "reelQuestionType": route.get("reelQuestionType"),
        "requiredEvidence": route.get("requiredEvidence", []),
        "needsRetrieval": route.get("needsRetrieval", trace.get("needsRetrieval")),
        "needsVerification": route.get("needsVerification"),
        "recommendationActionType": route.get("recommendationActionType"),
    }
    if not isinstance(actual["requiredEvidence"], list):
        actual["requiredEvidence"] = []
    return actual


def _citation_provenance(trace: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    metrics = _object(trace.get("workflowMetrics"))
    diagnostics = _object(metrics.get("diagnostics"))
    mappings = metrics.get("citationEvidenceMappings")
    if not isinstance(mappings, list):
        mappings = diagnostics.get("citationEvidenceMappings")
    if not isinstance(mappings, list):
        mappings = []
    evidence_ids = metrics.get("citationEvidenceIds")
    if not isinstance(evidence_ids, list):
        evidence_ids = diagnostics.get("citationEvidenceIds")
    if not isinstance(evidence_ids, list):
        evidence_ids = []
    return (
        [item for item in evidence_ids if isinstance(item, str)],
        [item for item in mappings if isinstance(item, dict)],
    )


def _evaluation_citations(
    citations: list[dict[str, Any]], trace: dict[str, Any], reranked: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not citations:
        return []
    context_by_id = {
        item.get("evidenceId"): item
        for item in reranked
        if item.get("evidenceId")
    }
    evidence_ids, mappings = _citation_provenance(trace)
    by_index: dict[int, str] = {}
    for mapping in mappings:
        index = mapping.get("citationIndex")
        evidence_id = mapping.get("evidenceId")
        if (
            isinstance(index, int)
            and index >= 0
            and isinstance(evidence_id, str)
            and index not in by_index
            and evidence_id in context_by_id
        ):
            by_index[index] = evidence_id
    if len(by_index) < len(citations) and len(evidence_ids) == len(citations):
        for index, evidence_id in enumerate(evidence_ids):
            if evidence_id in context_by_id:
                by_index.setdefault(index, evidence_id)

    output: list[dict[str, Any]] = []
    for index, citation in enumerate(citations):
        evidence_id = by_index.get(index)
        context = context_by_id.get(evidence_id) if evidence_id else None
        if context and citation.get("reelId") not in {None, context.get("reelId")}:
            evidence_id = None
        if evidence_id:
            output.append({**citation, "evidenceId": evidence_id})
        else:
            output.append(dict(citation))
    return output


def sanitize_runner_diagnostic(
    stdout: str | bytes | None = None,
    stderr: str | bytes | None = None,
    limit: int = 4000,
) -> str:
    """Return bounded child output with credentials and session material removed."""

    parts: list[str] = []
    for label, value in (("stdout", stdout), ("stderr", stderr)):
        if value is None:
            continue
        text = value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)
        if not text:
            continue
        text = _DATABASE_URL_RE.sub("<redacted-db-url>", text)
        text = _BEARER_RE.sub("Bearer <redacted>", text)
        text = _COOKIE_HEADER_RE.sub(r"\1<redacted>", text)
        text = _SENSITIVE_VALUE_RE.sub(
            lambda match: f"{match.group(0).split(':', 1)[0].split('=', 1)[0]}=<redacted>",
            text,
        )
        parts.append(f"{label}: {' '.join(text.split())}")
    diagnostic = " | ".join(parts) or "<no child output>"
    return diagnostic[:limit]


def normalize_runner_case(
    row: EvaluationRow, case: dict[str, Any], trace: dict[str, Any] | None = None
) -> NormalizedExecutionResult:
    trace = trace or case.get("trace") or {}
    retrieved = trace.get("retrievedContexts") or trace.get("retrievedChunkIds") or []
    reranked = trace.get("rerankedContexts") or trace.get("rerankedChunkIds") or retrieved
    retrieved_contexts = [
        item if isinstance(item, dict) else {"evidenceId": item}
        for item in retrieved
    ]
    reranked_contexts = [
        item if isinstance(item, dict) else {"evidenceId": item}
        for item in reranked
    ]
    citations = case.get("citations") or trace.get("citations") or []
    citations = _evaluation_citations(citations, trace, reranked_contexts)
    return NormalizedExecutionResult(
        runId=case.get("runId", "typescript-runner"),
        caseId=row.id,
        executionStatus="COMPLETED" if case.get("status") == "EVALUATED" else "RECONCILED_FAILURE",
        input={"question": row.question},
        reference={
            "answer": row.referenceAnswer,
            "relevantEvidenceIds": row.relevantEvidenceIds,
            "expectedReelIds": row.expectedReelIds,
            "expectedIntent": row.expectedIntent,
            "expectedEvidenceTypes": row.expectedEvidenceTypes,
        },
        actual={
            "answer": case.get("finalAnswer"),
            "route": _route_from_trace(trace),
            "retrievedContexts": retrieved_contexts,
            "rerankedContexts": reranked_contexts,
            "citations": citations,
        },
        trace={
            **(_object(trace.get("workflowMetrics")) or trace),
            **({"ragTraceId": trace["traceId"]} if trace.get("traceId") else {}),
        },
        modelCalls=trace.get("modelCalls", []),
        latencyMs=case.get("latencyMs", trace.get("latencyMs")),
    )


def load_runner_report(
    report_path: Path, rows: dict[str, EvaluationRow], traces_path: Path | None = None
) -> dict[str, NormalizedExecutionResult]:
    report = load_json(report_path)
    if not isinstance(report, dict):
        raise ValueError(f"{report_path}: runner report must be a JSON object")
    traces = {}
    if traces_path:
        trace_rows = load_json_or_jsonl(traces_path)
        traces = {item.get("caseId", item.get("message")): item for item in trace_rows}
    output = {}
    for case in report.get("cases", []):
        case_id = case.get("caseId")
        if case_id in rows:
            case["runId"] = report.get("runId")
            output[case_id] = normalize_runner_case(rows[case_id], case, traces.get(case_id))
    return output


def invoke_typescript_runner(arguments: list[str]) -> Path:
    try:
        completed = subprocess.run(
            ["node", str(RUNNER), *arguments],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        diagnostic = sanitize_runner_diagnostic(error.stdout, error.stderr)
        raise RuntimeError(
            f"TypeScript runner failed with exit code {error.returncode}: {diagnostic}"
        ) from error
    except OSError as error:
        diagnostic = sanitize_runner_diagnostic(stderr=str(error))
        raise RuntimeError(f"TypeScript runner could not start: {diagnostic}") from error
    for line in reversed(completed.stdout.splitlines()):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and payload.get("reportPath"):
            return Path(payload["reportPath"])
    raise RuntimeError("TypeScript runner completed without a reportPath")


def fixture_execution(
    row: EvaluationRow, run_id: str, variant: dict[str, Any]
) -> NormalizedExecutionResult:
    evidence_id = row.relevantEvidenceIds[0] if row.relevantEvidenceIds else None
    reel_id = row.expectedReelIds[0] if row.expectedReelIds else None
    evidence_type = next((item for item in row.expectedEvidenceTypes if item != "NONE"), None)
    contexts = (
        [
            {
                "evidenceId": evidence_id,
                "reelId": reel_id,
                "evidenceType": evidence_type or "TRANSCRIPT",
                "text": row.referenceAnswer or "fixture evidence",
                "rank": 1,
            }
        ]
        if evidence_id
        else []
    )
    citations = (
        [{"evidenceId": evidence_id, "reelId": reel_id, "evidenceType": evidence_type}]
        if evidence_id
        else []
    )
    return NormalizedExecutionResult(
        runId=run_id,
        caseId=row.id,
        executionStatus="FIXTURE",
        input={"question": row.question},
        reference={
            "answer": row.referenceAnswer,
            "relevantEvidenceIds": row.relevantEvidenceIds,
            "expectedReelIds": row.expectedReelIds,
            "expectedIntent": row.expectedIntent,
            "expectedEvidenceTypes": row.expectedEvidenceTypes,
        },
        actual={
            "answer": row.referenceAnswer,
            "route": {
                "intent": row.expectedIntent,
                "referenceTarget": row.expectedReferenceTarget,
                "reelQuestionType": row.expectedReelQuestionType,
                "requiredEvidence": row.expectedEvidenceTypes,
            },
            "retrievedContexts": contexts,
            "rerankedContexts": contexts,
            "citations": citations,
        },
        trace={"retryCount": 0, "citationRetryCount": 0, "revisionDepth": 0},
        modelCalls=[],
        latencyMs=1.0,
        variant=variant,
    )
