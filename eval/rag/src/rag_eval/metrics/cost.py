"""Production, indexing, and judge cost accounting stay separate."""

from __future__ import annotations

from typing import Any


def model_call_cost(call: dict[str, Any], catalog: dict[str, Any]) -> dict[str, Any]:
    price = catalog["models"].get(call.get("model"))
    if price is None:
        return {
            "pricingStatus": "UNKNOWN",
            "costUsd": None,
            "warning": f"No catalog price for {call.get('model')}",
        }
    if price["billingUnit"] == "AUDIO_MINUTE":
        if call.get("audioMinutes") is None:
            return {
                "pricingStatus": "USAGE_UNIT_UNAVAILABLE",
                "costUsd": None,
                "warning": "AUDIO_MINUTE usage is absent from this model-call record",
            }
        return {
            "pricingStatus": "KNOWN",
            "costUsd": call["audioMinutes"] * price["audioRate"],
            "warning": None,
        }
    if price["billingUnit"] not in {"M_TOKENS", "M_INPUT_TOKENS"}:
        return {
            "pricingStatus": "USAGE_UNIT_UNAVAILABLE",
            "costUsd": None,
            "warning": f"{price['billingUnit']} usage is absent from this model-call record",
        }
    if call.get("inputTokens") is None or (
        price.get("outputRate") is not None and call.get("outputTokens") is None
    ):
        return {
            "pricingStatus": "USAGE_UNAVAILABLE",
            "costUsd": None,
            "warning": "Provider or explicitly estimated token usage is unavailable",
        }
    cost = call["inputTokens"] * price["inputRate"] / 1_000_000
    if price.get("outputRate") is not None:
        cost += call["outputTokens"] * price["outputRate"] / 1_000_000
    return {"pricingStatus": "KNOWN", "costUsd": cost, "warning": None}


def aggregate_costs(calls: list[dict[str, Any]], catalog: dict[str, Any]) -> dict[str, Any]:
    role_costs: dict[str, float | None] = {}
    warnings: list[str] = []
    scope_totals: dict[str, float | None] = {
        "QUERY": 0.0,
        "INDEXING": 0.0,
        "EVALUATION_JUDGE": 0.0,
    }
    for call in calls:
        result = model_call_cost(call, catalog)
        role = call.get("modelRole", "unknown")
        previous = role_costs.get(role, 0.0)
        if result["costUsd"] is None or previous is None:
            role_costs[role] = None
            scope_totals[call.get("scope", "QUERY")] = None
            if result["warning"]:
                warnings.append(result["warning"])
        else:
            role_costs[role] = previous + result["costUsd"]
            scope = call.get("scope", "QUERY")
            if scope_totals[scope] is not None:
                scope_totals[scope] += result["costUsd"]
    known = [value for value in scope_totals.values() if value is not None]
    combined = sum(known) if len(known) == len(scope_totals) else None
    canonical_roles = {
        "ROUTER": "routerCostUsd",
        "RETRIEVAL_PLANNER": "plannerCostUsd",
        "RETRIEVAL_TOOL": "toolCostUsd",
        "EMBEDDING": "embeddingCostUsd",
        "RERANKER": "rerankerCostUsd",
        "CONTEXT_SUFFICIENCY": "sufficiencyCostUsd",
        "ANSWER": "answerCostUsd",
        "ANSWER_REVISION": "revisionCostUsd",
        "VERIFIER": "primaryVerifierCostUsd",
        "VERIFIER_ESCALATION": "escalationVerifierCostUsd",
        "CITATION_ATTRIBUTION": "citationCostUsd",
        "TRANSCRIPTION": "transcriptionCostUsd",
        "VISION": "visionCostUsd",
        "METADATA_EXTRACTION": "metadataCostUsd",
        "SECTION_SUMMARY": "sectionSummaryCostUsd",
        "EMBEDDING_INDEX": "embeddingIndexCostUsd",
        "INDEX_QUALITY": "indexQualityCostUsd",
    }
    canonical_costs = {output: role_costs.get(role) for role, output in canonical_roles.items()}
    judge_calls = [call for call in calls if call.get("scope") == "EVALUATION_JUDGE"]
    return {
        "roleCostsUsd": role_costs,
        **canonical_costs,
        "totalQueryCostUsd": scope_totals["QUERY"],
        "totalIndexingCostUsd": scope_totals["INDEXING"],
        "evaluationJudgeInputTokens": sum(call.get("inputTokens") or 0 for call in judge_calls),
        "evaluationJudgeOutputTokens": sum(call.get("outputTokens") or 0 for call in judge_calls),
        "evaluationJudgeCostUsd": scope_totals["EVALUATION_JUDGE"],
        "combinedExperimentCostUsd": combined,
        "pricingWarnings": sorted(set(warnings)),
    }


def safe_cost_per(total: float | None, denominator: int) -> float | None:
    return None if total is None or denominator == 0 else total / denominator
