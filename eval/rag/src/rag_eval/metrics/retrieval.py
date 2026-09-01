"""Objective retrieval metrics; these never call an LLM."""

import math


def recall_at_k(retrieved: list[str], relevant: list[str], k: int) -> float | None:
    truth = set(relevant)
    if not truth:
        return None
    return len(set(retrieved[:k]) & truth) / len(truth)


def reciprocal_rank(retrieved: list[str], relevant: list[str]) -> float | None:
    truth = set(relevant)
    if not truth:
        return None
    return next((1 / rank for rank, item in enumerate(retrieved, 1) if item in truth), 0.0)


def ndcg_at_k(retrieved: list[str], relevant: list[str], k: int) -> float | None:
    truth = set(relevant)
    if not truth:
        return None
    dcg = sum(
        1 / math.log2(rank + 1) for rank, item in enumerate(retrieved[:k], 1) if item in truth
    )
    ideal = sum(1 / math.log2(rank + 1) for rank in range(1, min(k, len(truth)) + 1))
    return dcg / ideal


def evidence_hit_rate(retrieved: list[str], relevant: list[str]) -> float | None:
    return None if not relevant else float(bool(set(retrieved) & set(relevant)))
