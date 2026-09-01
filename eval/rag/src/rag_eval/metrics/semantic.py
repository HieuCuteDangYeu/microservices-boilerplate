"""Current Ragas semantic/agent metric wiring with injectable offline scorers."""

from __future__ import annotations

from typing import Any, Protocol

from ragas.metrics.collections import (
    AgentGoalAccuracy,
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
    FactualCorrectness,
    Faithfulness,
    MultiModalFaithfulness,
    MultiModalRelevance,
    ToolCallAccuracy,
    ToolCallF1,
)


class Scorer(Protocol):
    def score(self, **kwargs: Any) -> Any: ...


SEMANTIC_NAMES = (
    "faithfulness",
    "factual_correctness",
    "response_relevancy",
    "context_precision",
    "context_recall",
)


def current_ragas_metric_types() -> dict[str, type]:
    return {
        "faithfulness": Faithfulness,
        "factual_correctness": FactualCorrectness,
        "response_relevancy": AnswerRelevancy,
        "context_precision": ContextPrecision,
        "context_recall": ContextRecall,
        "tool_call_accuracy": ToolCallAccuracy,
        "tool_call_f1": ToolCallF1,
        "agent_goal_accuracy": AgentGoalAccuracy,
        "multi_modal_faithfulness": MultiModalFaithfulness,
        "multi_modal_relevance": MultiModalRelevance,
    }


class SemanticMetricSuite:
    def __init__(
        self,
        scorers: dict[str, Scorer] | None = None,
        usage_tracker: Any | None = None,
    ):
        self.scorers = scorers or {}
        self.usage_tracker = usage_tracker

    def score(self, payloads: dict[str, dict[str, Any]]) -> dict[str, float | None]:
        output: dict[str, float | None] = {}
        for name in SEMANTIC_NAMES:
            scorer = self.scorers.get(name)
            if scorer is None or name not in payloads:
                output[name] = None
                continue
            result = scorer.score(**payloads[name])
            output[name] = float(result.value)
        return output

    async def ascore(self, payloads: dict[str, dict[str, Any]]) -> dict[str, float | None]:
        output: dict[str, float | None] = {}
        for name in SEMANTIC_NAMES:
            scorer = self.scorers.get(name)
            if scorer is None or name not in payloads:
                output[name] = None
                continue
            try:
                if hasattr(scorer, "ascore"):
                    result = await scorer.ascore(**payloads[name])
                else:
                    result = scorer.score(**payloads[name])
                output[name] = float(result.value)
            except Exception:
                # Judge unavailability does not remove the production execution row.
                output[name] = None
        return output

    async def ascore_with_usage(
        self, payloads: dict[str, dict[str, Any]], usage_key: str
    ) -> tuple[dict[str, float | None], list[dict[str, Any]]]:
        if self.usage_tracker:
            self.usage_tracker.begin(usage_key)
        try:
            metrics = await self.ascore(payloads)
        finally:
            calls = self.usage_tracker.take(usage_key) if self.usage_tracker else []
        return metrics, calls


def build_live_semantic_suite(
    llm: Any, embeddings: Any, usage_tracker: Any | None = None
) -> SemanticMetricSuite:
    return SemanticMetricSuite(
        {
            "faithfulness": Faithfulness(llm),
            "factual_correctness": FactualCorrectness(llm),
            "response_relevancy": AnswerRelevancy(llm, embeddings),
            "context_precision": ContextPrecision(llm),
            "context_recall": ContextRecall(llm),
        },
        usage_tracker,
    )


def tool_metrics_supported(trajectory: list[dict[str, Any]] | None) -> bool:
    return bool(trajectory)


def build_tool_metrics() -> dict[str, Any]:
    # Multiple authorized tool trajectories can be correct, so order is not a hard requirement.
    return {
        "tool_call_accuracy": ToolCallAccuracy(strict_order=False),
        "tool_call_f1": ToolCallF1(),
    }


def build_agent_goal_metric(llm: Any) -> Any:
    return AgentGoalAccuracy(llm)


def multimodal_support(has_original_images: bool) -> str:
    return "RAGAS_NATIVE" if has_original_images else "TEXT_GROUNDED_MODALITY_ONLY"
