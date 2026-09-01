from rag_eval.metrics.cost import aggregate_costs, model_call_cost, safe_cost_per
from rag_eval.metrics.operational import latency_summary, percentile, reliability_metrics
from rag_eval.pricing import load_pricing


def call(**overrides):
    value = {
        "modelRole": "router",
        "model": "@cf/openai/gpt-oss-20b",
        "inputTokens": 1_000_000,
        "outputTokens": 1_000_000,
        "usageSource": "PROVIDER",
        "scope": "QUERY",
        "attempt": 1,
        "latencyMs": 10,
    }
    value.update(overrides)
    return value


def test_known_unknown_and_missing_usage_costs():
    catalog = load_pricing()
    assert model_call_cost(call(), catalog)["costUsd"] == 0.5
    unknown = model_call_cost(call(model="unknown"), catalog)
    assert unknown["pricingStatus"] == "UNKNOWN"
    assert unknown["costUsd"] is None
    missing = model_call_cost(call(inputTokens=None), catalog)
    assert missing["pricingStatus"] == "USAGE_UNAVAILABLE"
    assert missing["costUsd"] is None
    audio = model_call_cost(
        call(
            model="@cf/openai/whisper-large-v3-turbo",
            audioMinutes=10,
            scope="INDEXING",
        ),
        catalog,
    )
    assert audio["costUsd"] == 0.005


def test_cost_scopes_and_zero_denominators_stay_separate():
    costs = aggregate_costs(
        [
            call(scope="QUERY"),
            call(modelRole="indexQuality", scope="INDEXING"),
            call(modelRole="judge", scope="EVALUATION_JUDGE"),
        ],
        load_pricing(),
    )
    assert costs["totalQueryCostUsd"] == 0.5
    assert costs["totalIndexingCostUsd"] == 0.5
    assert costs["evaluationJudgeCostUsd"] == 0.5
    assert costs["evaluationJudgeInputTokens"] == 1_000_000
    assert costs["evaluationJudgeOutputTokens"] == 1_000_000
    assert costs["combinedExperimentCostUsd"] == 1.5
    assert safe_cost_per(1.0, 0) is None


def test_percentiles_latency_and_failure_rates():
    assert percentile([10, 20, 30, 40], 0.95) == 38.5
    rows = [
        {
            "latencyMs": 100,
            "modelCalls": [call(providerStatus=429, providerCategory="ACCOUNT_LIMITED")],
            "trace": {"routerFallback": True, "revisionDepth": 1, "retryCount": 1},
        },
        {"latencyMs": 200, "modelCalls": [call(attempt=2)], "trace": {}},
    ]
    assert latency_summary(rows)["endToEnd"]["p50"] == 150
    reliability = reliability_metrics(rows)
    assert reliability["http429Count"] == 1
    assert reliability["accountLimitedCount"] == 1
    assert reliability["providerRetries"] == 1
    assert reliability["routerFallbackRate"] == 0.5
    assert reliability["answerRevisionRate"] == 0.5
