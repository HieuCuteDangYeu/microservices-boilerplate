"""Authorization is an objective hard gate, never an LLM opinion."""

from typing import Any


def access_control_violations(
    contexts: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    authorized_reels: list[str],
    authorized_evidence: list[str],
) -> int:
    reels = set(authorized_reels)
    evidence = set(authorized_evidence)
    violations = 0
    for item in [*contexts, *citations]:
        if item.get("reelId") and reels and item["reelId"] not in reels:
            violations += 1
        if item.get("evidenceId") and evidence and item["evidenceId"] not in evidence:
            violations += 1
    return violations
