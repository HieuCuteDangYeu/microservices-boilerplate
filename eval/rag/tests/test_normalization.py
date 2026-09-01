import json

import pytest
from pydantic import ValidationError

from rag_eval.adapters.runner_output import fixture_execution, normalize_runner_case
from rag_eval.dataset import load_dataset
from rag_eval.schemas import NormalizedExecutionResult


def test_runner_output_normalizes_to_v1():
    row = list(load_dataset("rag-frozen-ami-v1"))[0]
    result = normalize_runner_case(
        row,
        {
            "runId": "run-1",
            "caseId": row.id,
            "status": "EVALUATED",
            "finalAnswer": row.referenceAnswer,
            "citations": [],
            "latencyMs": 123,
        },
        {"route": {"intent": "REEL_VIDEO_QUESTION"}, "modelCalls": []},
    )
    assert result.schemaVersion == "rag-eval-result-v1"
    assert result.executionStatus == "COMPLETED"
    assert result.latencyMs == 123


def test_fixture_result_is_json_round_trip_and_schema_rejects_missing_answer():
    row = list(load_dataset("rag-frozen-ami-v1"))[0]
    result = fixture_execution(row, "run-1", {"variantName": "test"})
    assert NormalizedExecutionResult.model_validate_json(result.model_dump_json()) == result
    payload = json.loads(result.model_dump_json())
    del payload["actual"]["answer"]
    with pytest.raises(ValidationError):
        NormalizedExecutionResult.model_validate(payload)
