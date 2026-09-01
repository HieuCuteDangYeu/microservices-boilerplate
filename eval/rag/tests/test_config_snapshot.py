import json

import pytest

from rag_eval.compare import compare_summaries
from rag_eval.config_snapshot import load_runtime_snapshot


def test_invalid_timeout_runs_cannot_be_compared():
    with pytest.raises(ValueError, match="Invalid experiment"):
        compare_summaries({"status": "INVALID_CONFIG_TIMEOUT_8000"}, {})


def test_remote_live_requires_matching_deployment_snapshot(tmp_path):
    with pytest.raises(ValueError, match="requires"):
        load_runtime_snapshot(None, None)
    snapshot = {
        "routerPrimaryModel": "gpt",
        "routerFallbackModel": "glm",
        "routerTimeoutMs": 45000,
        "routerFallbackTimeoutMs": 60000,
        "routerMaxCompletionTokens": 2048,
        "structuredReasoningEffort": "low",
        "aiGatewayEnabled": True,
        "gitSha": "abc",
        "datasetVersion": "rag-frozen-ami-v1",
        "variantName": "deployed",
        "roles": {"ROUTER": {"model": "gpt", "timeoutMs": 45000, "maxCompletionTokens": 2048}},
    }
    file = tmp_path / "snapshot.json"
    file.write_text(json.dumps(snapshot))
    assert load_runtime_snapshot(str(file), "abc")["routerTimeoutMs"] == 45000
    with pytest.raises(ValueError, match="gitSha"):
        load_runtime_snapshot(str(file), "wrong")
