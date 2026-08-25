from rag_eval.control_plane import _estimated_neurons, _summary


def test_partial_account_limited_summary_fails_closed():
    cases = [
        {
            "caseId": "generic-01",
            "metrics": {"intentAccuracy": 0.0},
            "latencyMs": 10,
            "modelCalls": [
                {
                    "modelRole": "ROUTER",
                    "model": "@cf/openai/gpt-oss-20b",
                    "inputTokens": None,
                    "outputTokens": None,
                    "usageSource": "UNAVAILABLE",
                    "latencyMs": 10,
                    "attempt": 1,
                    "providerStatus": 429,
                    "providerCategory": "ACCOUNT_LIMITED",
                    "scope": "QUERY",
                }
            ],
            "hardGatePassed": False,
        }
    ]
    summary = _summary(
        cases,
        "partial-run",
        "ROUTER",
        "@cf/openai/gpt-oss-20b",
        expected_case_count=65,
        stopped_reason="ACCOUNT_LIMITED",
    )
    assert summary["complete"] is False
    assert summary["hardGatePassed"] is False
    assert summary["reliability"]["accountLimitedCount"] == 1
    assert summary["runEstimatedNeurons"] is None


def test_neuron_estimate_uses_workers_ai_neuron_price():
    assert _estimated_neurons(0.011) == 1_000
