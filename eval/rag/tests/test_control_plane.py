import json
from types import SimpleNamespace

import pytest

from rag_eval import control_plane
from rag_eval.control_plane import _estimated_neurons, _summary


@pytest.mark.parametrize("timeout", [8000, 20000, 45000, 60000])
async def test_python_bridge_forwards_explicit_config_and_persists_snapshot(
    tmp_path, monkeypatch, timeout
):
    monkeypatch.setattr(control_plane, "RESULTS", tmp_path)
    snapshot = {
        "roleModel": "test-model",
        "caseIds": ["explicit-01"],
        "configuredTimeoutMs": timeout,
    }

    def fake_run(command, **kwargs):
        assert command[command.index("--router-timeout-ms") + 1] == str(timeout)
        assert command[command.index("--config") + 1] == "candidate.json"
        assert command[command.index("--subset") + 1] == "harness"
        output = control_plane.Path(command[command.index("--output") + 1])
        assert output.parent == tmp_path / f"test-{timeout}"
        output.write_text(
            json.dumps({"configSnapshot": snapshot, "samples": [{"id": "explicit-01"}]})
        )
        return SimpleNamespace(returncode=0, stderr="")

    async def fake_experiment(*args, **kwargs):
        return [
            {
                "caseId": "explicit-01",
                "metrics": {"schemaSuccess": 1},
                "latencyMs": 1,
                "modelCalls": [],
                "hardGatePassed": True,
            }
        ]

    monkeypatch.setattr(control_plane.subprocess, "run", fake_run)
    monkeypatch.setattr(control_plane.control_plane_experiment, "arun", fake_experiment)
    directory, summary = await control_plane.run_control_plane(
        "ROUTER", "test-model", "test.env", f"test-{timeout}", "candidate.json", "harness", timeout
    )
    assert summary["configSnapshot"] == snapshot
    assert summary["expectedCaseCount"] == 1
    assert (directory / "observations.json").exists()
    assert json.loads((directory / "summary.json").read_text())["configSnapshot"] == snapshot
    with pytest.raises(FileExistsError):
        await control_plane.run_control_plane(
            "ROUTER", "test-model", "test.env", f"test-{timeout}", "candidate.json"
        )


def test_network_failure_is_not_timeout_and_unknown_usage_stays_null():
    call = {
        "modelRole": "ROUTER",
        "model": "@cf/openai/gpt-oss-20b",
        "providerStatus": "NETWORK_ERROR",
        "providerCategory": "TRANSIENT_PROVIDER_FAILURE",
        "usageSource": "UNAVAILABLE",
    }
    cases = [
        {
            "caseId": "one",
            "metrics": {"schemaSuccess": 0},
            "latencyMs": 3,
            "modelCalls": [call],
            "hardGatePassed": False,
        }
    ]
    summary = _summary(cases, "run", "ROUTER", call["model"], 1, None)
    assert summary["reliability"]["timeoutCount"] == 0
    assert summary["cost"]["totalQueryCostUsd"] is None
    assert summary["tokens"]["inputTokens"] is None
    assert call["costUsd"] is None and call["estimatedNeurons"] is None


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
