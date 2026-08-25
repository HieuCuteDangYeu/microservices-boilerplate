"""Canonical experiments-first Ragas evaluation."""

from typing import Any

from ragas import experiment

from rag_eval.evaluate import evaluate_case_async
from rag_eval.metrics.semantic import SemanticMetricSuite
from rag_eval.schemas import EvaluationRow, NormalizedExecutionResult


@experiment(name_prefix="rag-eval")
async def rag_experiment(
    row: EvaluationRow,
    execution_results: dict[str, NormalizedExecutionResult],
    variant: dict[str, Any],
    semantic_suite: SemanticMetricSuite | None = None,
) -> dict[str, Any]:
    execution = execution_results[row.id]
    result = await evaluate_case_async(row, execution, semantic_suite)
    result["variant"] = variant
    return result
