"""Ragas-owned live control-plane experiments over TypeScript observations."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from statistics import fmean
from typing import Any

from ragas import Dataset, experiment

from rag_eval.dataset import ROOT, load_dataset
from rag_eval.metrics.cost import aggregate_costs, model_call_cost
from rag_eval.metrics.operational import percentile, reliability_metrics
from rag_eval.pricing import load_pricing
from rag_eval.schemas import EvaluationRow

REPOSITORY_ROOT = ROOT.parents[1]
RESULTS = ROOT / "results"


def _exact(left: Any, right: Any) -> float:
    return float(left == right)


def _set_exact(left: list[str], right: list[str]) -> float:
    return float(set(left) == set(right))


def _precision(actual: list[str], expected: list[str]) -> float:
    if not actual:
        return float(not expected)
    return len(set(actual) & set(expected)) / len(set(actual))


def _recall(actual: list[str], expected: list[str]) -> float:
    if not expected:
        return 1.0
    return len(set(actual) & set(expected)) / len(set(expected))


def _schema_success(observation: dict[str, Any]) -> float:
    schema_errors = {
        "STRUCTURED_COMPLETION_INVALID_JSON",
        "STRUCTURED_COMPLETION_SCHEMA_INVALID",
        "STRUCTURED_COMPLETION_EMPTY_CONTENT",
        "STRUCTURED_COMPLETION_TRUNCATED",
    }
    return float(
        observation.get("success", False)
        and bool(observation["calls"])
        and all(call.get("providerStatus") == 200 for call in observation["calls"])
        and not any(call.get("errorCode") in schema_errors for call in observation["calls"])
    )


@experiment(name_prefix="rag-control-plane")
async def control_plane_experiment(
    row: EvaluationRow,
    observations: dict[str, dict[str, Any]],
    mode: str,
    model: str,
) -> dict[str, Any]:
    observation = observations[row.id]
    metrics: dict[str, float]
    if mode == "ROUTER":
        metrics = {
            "intentAccuracy": _exact(
                observation.get("actualIntent"), observation["expectedIntent"]
            ),
            "referenceTargetAccuracy": _exact(
                observation.get("actualReferenceTarget"),
                observation["expectedReferenceTarget"],
            ),
            "reelQuestionTypeAccuracy": _exact(
                observation.get("actualReelQuestionType"),
                observation["expectedReelQuestionType"],
            ),
            "requiredEvidenceAccuracy": _set_exact(
                observation.get("actualRequiredEvidence") or [],
                observation["expectedRequiredEvidence"],
            ),
            "recommendationActionAccuracy": _exact(
                observation.get("actualRecommendationAction"),
                observation["expectedRecommendationAction"],
            ),
            "falseNormalChat": float(
                observation["expectedIntent"] == "REEL_VIDEO_QUESTION"
                and observation.get("actualIntent") == "NORMAL_CHAT"
            ),
            "falseReel": float(
                observation["expectedIntent"] != "REEL_VIDEO_QUESTION"
                and observation.get("actualIntent") == "REEL_VIDEO_QUESTION"
            ),
            "schemaSuccess": _schema_success(observation),
        }
    elif mode == "SUFFICIENCY":
        actual_ids = observation.get("actualSupportedEvidenceIds") or []
        expected_ids = observation["expectedSupportedEvidenceIds"]
        metrics = {
            "expectedSufficientAccuracy": _exact(
                observation.get("actualSufficient"), observation["expectedSufficient"]
            ),
            "supportedEvidencePrecision": _precision(actual_ids, expected_ids),
            "supportedEvidenceRecall": _recall(actual_ids, expected_ids),
            "recommendedActionAccuracy": _exact(
                observation.get("actualRecommendedAction"),
                observation["expectedRecommendedAction"],
            ),
            "schemaSuccess": _schema_success(observation),
        }
    else:
        actual_ids = observation.get("actualSupportedEvidenceIds") or []
        expected_ids = observation["expectedSupportedEvidenceIds"]
        metrics = {
            "verifierAccuracy": _exact(
                observation.get("actualPassed"), observation["expectedPassed"]
            ),
            "supportedEvidencePrecision": _precision(actual_ids, expected_ids),
            "supportedEvidenceRecall": _recall(actual_ids, expected_ids),
            "contradictionAccuracy": _exact(
                observation.get("actualContradiction"),
                observation["expectedContradiction"],
            ),
            "schemaSuccess": _schema_success(observation),
        }
    return {
        "caseId": row.id,
        "datasetVersion": row.datasetVersion,
        "mode": mode,
        "model": model,
        "category": row.category,
        "tags": row.tags,
        "metrics": metrics,
        "latencyMs": observation["latencyMs"],
        "modelCalls": observation["calls"],
        "observation": observation,
        "hardGatePassed": bool(observation.get("success", False))
        and all(
            value == (0 if key in {"falseNormalChat", "falseReel"} else 1)
            for key, value in metrics.items()
        ),
    }


def _mean(cases: list[dict[str, Any]], key: str) -> float | None:
    values = [case["metrics"].get(key) for case in cases]
    available = [value for value in values if value is not None]
    return fmean(available) if available else None


def _estimated_neurons(cost_usd: float | None) -> float | None:
    return None if cost_usd is None else cost_usd / 0.011 * 1_000


def _summary(
    cases: list[dict[str, Any]],
    run_id: str,
    mode: str,
    model: str,
    expected_case_count: int,
    stopped_reason: str | None,
    config_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not cases:
        raise RuntimeError(f"{mode} Ragas experiment returned zero completed case results")
    metric_names = sorted({key for case in cases for key in case["metrics"]})
    latencies = [case["latencyMs"] for case in cases]
    calls = [call for case in cases for call in case["modelCalls"]]
    executions = [
        {"latencyMs": case["latencyMs"], "modelCalls": case["modelCalls"], "trace": {}}
        for case in cases
    ]
    costs = aggregate_costs(calls, load_pricing())
    for call in calls:
        call["costUsd"] = model_call_cost(call, load_pricing())["costUsd"]
        call["estimatedNeurons"] = _estimated_neurons(call["costUsd"])
    timeout_count = sum(call.get("providerStatus") == "TIMEOUT" for call in calls)
    schema_count = sum(
        call.get("errorCode") == "STRUCTURED_COMPLETION_SCHEMA_INVALID" for call in calls
    )
    provider_failures = sum(call.get("providerStatus") != 200 for call in calls)
    truncation_count = sum(
        call.get("errorCode") == "STRUCTURED_COMPLETION_TRUNCATED" for call in calls
    )
    metrics = {key: _mean(cases, key) for key in metric_names}
    denominators = {
        key: sum(case["metrics"].get(key) is not None for case in cases) for key in metric_names
    }
    if mode == "ROUTER":
        reel_cases = [
            case
            for case in cases
            if case.get("observation", {}).get("expectedIntent") == "REEL_VIDEO_QUESTION"
        ]
        non_reel_cases = [
            case
            for case in cases
            if case.get("observation", {}).get("expectedIntent") != "REEL_VIDEO_QUESTION"
        ]
        metrics["falseNormalChatRate"] = _mean(reel_cases, "falseNormalChat")
        metrics["falseReelRate"] = _mean(non_reel_cases, "falseReel")
        denominators.update(falseNormalChatRate=len(reel_cases), falseReelRate=len(non_reel_cases))
    metrics.update(
        timeoutRate=timeout_count / len(cases),
        truncationRate=truncation_count / len(cases),
        providerFailureRate=provider_failures / len(cases),
    )
    denominators.update(
        timeoutRate=len(cases), truncationRate=len(cases), providerFailureRate=len(cases)
    )
    completion_tokens = [
        call["outputTokens"] for call in calls if call.get("outputTokens") is not None
    ]
    complete_usage = bool(calls) and len(completion_tokens) == len(calls)
    tokens = {
        key: (
            sum(call[key] for call in calls)
            if calls and all(call.get(key) is not None for call in calls)
            else None
        )
        for key in ("inputTokens", "outputTokens", "reasoningTokens")
    }
    complete = len(cases) == expected_case_count
    return {
        "schemaVersion": "rag-control-plane-summary-v1",
        "runId": run_id,
        "dataset": "rag-generalization-v1",
        "mode": mode,
        "model": model,
        "configSnapshot": config_snapshot,
        "caseCount": len(cases),
        "expectedCaseCount": expected_case_count,
        "complete": complete,
        "stoppedReason": stopped_reason,
        "metrics": metrics,
        "metricDenominators": denominators,
        "tokens": tokens,
        "completionTokens": {
            **{
                f"p{p}": percentile(completion_tokens, p / 100) if complete_usage else None
                for p in (50, 90, 95)
            },
            "max": max(completion_tokens) if complete_usage else None,
            "observedCalls": len(completion_tokens),
            "expectedCalls": len(calls),
        },
        "reasoningTokenBreakdown": (
            "AVAILABLE"
            if tokens["reasoningTokens"] is not None
            else "PARTIAL"
            if any(call.get("reasoningTokens") is not None for call in calls)
            else "UNAVAILABLE"
        ),
        "structuralCompleted": sum(case["metrics"].get("schemaSuccess") == 1 for case in cases),
        "latencyMs": {
            "p50": percentile(latencies, 0.5),
            "p90": percentile(latencies, 0.9),
            "p95": percentile(latencies, 0.95),
            "max": max(latencies, default=None),
        },
        "cost": costs,
        "runEstimatedNeurons": _estimated_neurons(costs["totalQueryCostUsd"]),
        "reliability": {
            **reliability_metrics(executions),
            "timeoutCount": timeout_count,
            "schemaFailureCount": schema_count,
            "truncationCount": truncation_count,
            "invalidJsonCount": sum(
                call.get("errorCode") == "STRUCTURED_COMPLETION_INVALID_JSON" for call in calls
            ),
            "emptyContentCount": sum(
                call.get("errorCode") == "STRUCTURED_COMPLETION_EMPTY_CONTENT" for call in calls
            ),
            "providerFailureCount": provider_failures,
        },
        "hardGatePassed": complete
        and stopped_reason is None
        and all(case["hardGatePassed"] for case in cases),
        "failures": [case["caseId"] for case in cases if not case["hardGatePassed"]],
    }


def _write_report(cases: list[dict[str, Any]], summary: dict[str, Any]) -> Path:
    directory = RESULTS / summary["runId"]
    directory.mkdir(parents=True, exist_ok=True)
    ordered = sorted(cases, key=lambda case: case["caseId"])
    (directory / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (directory / "cases.jsonl").write_text(
        "".join(json.dumps(case, sort_keys=True) + "\n" for case in ordered),
        encoding="utf-8",
    )
    (directory / "ragas-experiment.json").write_text(
        json.dumps(ordered, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    lines = [
        "# Ragas control-plane experiment",
        "",
        f"- Run: {summary['runId']}",
        f"- Mode: {summary['mode']}",
        f"- Model: {summary['model']}",
        f"- Cases: {summary['caseCount']}",
        f"- Metrics: `{json.dumps(summary['metrics'], sort_keys=True)}`",
        f"- P50/P95 latency: {summary['latencyMs']['p50']}/{summary['latencyMs']['p95']} ms",
        f"- Query cost: {summary['cost']['totalQueryCostUsd']}",
        f"- Hard gate: {'PASS' if summary['hardGatePassed'] else 'FAIL'}",
        "",
    ]
    (directory / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    return directory


async def run_control_plane(
    mode: str,
    model: str,
    env_file: str,
    run_id: str | None = None,
    config_file: str | None = None,
    subset: str | None = None,
    router_timeout_ms: int | None = None,
    router_max_completion_tokens: int | None = None,
) -> tuple[Path, dict[str, Any]]:
    mode = mode.upper()
    if mode not in {"ROUTER", "SUFFICIENCY", "VERIFIER"}:
        raise ValueError("mode must be ROUTER, SUFFICIENCY, or VERIFIER")
    run_id = run_id or f"ragas-{mode.lower()}-{int(time.time())}"
    if not config_file:
        raise ValueError("versioned experiment --config is required")
    if Path(run_id).name != run_id or run_id in {".", ".."}:
        raise ValueError("run-id must be a single directory name")
    directory = RESULTS / run_id
    directory.mkdir(parents=True, exist_ok=False)
    output = directory / "observations.json"
    command = [
        "node",
        "scripts/ops/run-rag-control-plane-evaluation.cjs",
        "--mode",
        mode,
        "--env-file",
        env_file,
        "--output",
        str(output),
        "--config",
        config_file,
    ]
    if model:
        command += ["--model", model]
    if subset:
        command += ["--subset", subset]
    if router_timeout_ms is not None:
        command += ["--router-timeout-ms", str(router_timeout_ms)]
    if router_max_completion_tokens is not None:
        command += ["--router-max-completion-tokens", str(router_max_completion_tokens)]
    completed = subprocess.run(
        command,
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if not output.exists():
        raise RuntimeError(completed.stderr.strip() or "TypeScript evaluator produced no output")
    payload = json.loads(output.read_text(encoding="utf-8"))
    snapshot = payload["configSnapshot"]
    model = snapshot["roleModel"]
    all_rows = [
        row for row in load_dataset("rag-generalization-v1") if row.fixtureGroup == mode.lower()
    ]
    if snapshot["caseIds"] is not None:
        all_rows = [row for row in all_rows if row.id in snapshot["caseIds"]]
    observations = {sample["id"]: sample for sample in payload["samples"]}
    rows = [row for row in all_rows if row.id in observations]
    dataset = Dataset(
        name=f"rag-generalization-v1-{mode.lower()}",
        backend="local/jsonl",
        data_model=EvaluationRow,
        data=rows,
        root_dir=str(ROOT),
    )
    result = await control_plane_experiment.arun(
        dataset,
        name=run_id,
        observations=observations,
        mode=mode,
        model=model,
    )
    cases = [
        item.model_dump(mode="json") if hasattr(item, "model_dump") else dict(item)
        for item in result
    ]
    summary = _summary(
        cases,
        run_id,
        mode,
        model,
        len(all_rows),
        payload.get("stoppedReason"),
        snapshot,
    )
    return _write_report(cases, summary), summary
