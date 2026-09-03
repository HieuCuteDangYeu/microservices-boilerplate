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
    contexts = trace.get("rerankedContexts") or trace.get("retrievedContexts") or []
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
            "route": trace.get("route", {}),
            "retrievedContexts": trace.get("retrievedContexts", contexts),
            "rerankedContexts": trace.get("rerankedContexts", contexts),
            "citations": case.get("citations", trace.get("citations", [])),
        },
        trace=trace.get("workflowMetrics", trace),
        modelCalls=trace.get("modelCalls", []),
        latencyMs=case.get("latencyMs", trace.get("latencyMs")),
    )


def load_runner_report(
    report_path: Path, rows: dict[str, EvaluationRow], traces_path: Path | None = None
) -> dict[str, NormalizedExecutionResult]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    traces = {}
    if traces_path:
        trace_rows = json.loads(traces_path.read_text(encoding="utf-8"))
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
        if payload.get("reportPath"):
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
