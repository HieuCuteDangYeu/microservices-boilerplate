"""Objective citation attribution metrics."""

from typing import Any


def _ids(citations: list[dict[str, Any]]) -> set[str]:
    return {str(item["evidenceId"]) for item in citations if item.get("evidenceId")}


def citation_precision(citations: list[dict[str, Any]], relevant: list[str]) -> float | None:
    cited = _ids(citations)
    return None if not cited else len(cited & set(relevant)) / len(cited)


def citation_recall(citations: list[dict[str, Any]], relevant: list[str]) -> float | None:
    truth = set(relevant)
    return None if not truth else len(_ids(citations) & truth) / len(truth)


def citation_evidence_hit_rate(
    citations: list[dict[str, Any]], relevant: list[str]
) -> float | None:
    return None if not relevant else float(bool(_ids(citations) & set(relevant)))


def wrong_reel_count(citations: list[dict[str, Any]], expected_reels: list[str]) -> int:
    allowed = set(expected_reels)
    return sum(bool(item.get("reelId")) and item["reelId"] not in allowed for item in citations)


def wrong_modality_count(citations: list[dict[str, Any]], expected_types: list[str]) -> int:
    allowed = set(expected_types)
    return sum(
        bool(item.get("evidenceType")) and item["evidenceType"] not in allowed for item in citations
    )
