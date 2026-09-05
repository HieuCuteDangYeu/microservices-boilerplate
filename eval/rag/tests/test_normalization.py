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


def test_runner_output_uses_actual_route_and_final_citation_provenance():
    row = list(load_dataset("rag-frozen-ami-v2"))[0]
    result = normalize_runner_case(
        row,
        {
            "runId": "run-2",
            "caseId": row.id,
            "status": "EVALUATED",
            "finalAnswer": "Actual answer.",
            "citations": [
                {
                    "sourceType": "REEL",
                    "reelId": row.expectedReelIds[0],
                    "evidenceType": "TRANSCRIPT",
                }
            ],
            "latencyMs": 123,
        },
        {
            "traceId": "trace-2",
            "intent": "NORMAL_CHAT",
            "retrievedContexts": [
                {
                    "evidenceId": row.relevantEvidenceIds[0],
                    "reelId": row.expectedReelIds[0],
                    "evidenceType": "TRANSCRIPT",
                }
            ],
            "rerankedContexts": [
                {
                    "evidenceId": row.relevantEvidenceIds[0],
                    "reelId": row.expectedReelIds[0],
                    "evidenceType": "TRANSCRIPT",
                }
            ],
            "workflowMetrics": {
                "citationEvidenceIds": [row.relevantEvidenceIds[0]],
                "citationEvidenceMappings": [
                    {
                        "citationIndex": 0,
                        "selectedEvidenceId": "e0",
                        "evidenceId": row.relevantEvidenceIds[0],
                    }
                ],
                "diagnostics": {
                    "route": {"providerStatus": "SUCCESS"},
                    "routeDecision": {
                        "intent": "REEL_VIDEO_QUESTION",
                        "referenceTarget": "SHARED_REEL",
                        "reelQuestionType": "TRANSCRIPT_CONTENT",
                        "requiredEvidence": ["TRANSCRIPT"],
                        "needsRetrieval": True,
                        "needsVerification": True,
                        "recommendationActionType": "NONE",
                    },
                },
            },
            "nodeTimings": {},
        },
    )

    assert result.actual["route"] == {
        "intent": "REEL_VIDEO_QUESTION",
        "referenceTarget": "SHARED_REEL",
        "reelQuestionType": "TRANSCRIPT_CONTENT",
        "requiredEvidence": ["TRANSCRIPT"],
        "needsRetrieval": True,
        "needsVerification": True,
        "recommendationActionType": "NONE",
    }
    assert result.actual["citations"][0]["evidenceId"] == row.relevantEvidenceIds[0]
    assert result.trace["ragTraceId"] == "trace-2"


def test_runner_output_never_substitutes_expected_route_or_citation_ids():
    row = list(load_dataset("rag-frozen-ami-v2"))[0]
    result = normalize_runner_case(
        row,
        {
            "runId": "run-3",
            "caseId": row.id,
            "status": "EVALUATED",
            "finalAnswer": "Actual answer.",
            "citations": [],
        },
        {
            "intent": "REEL_VIDEO_QUESTION",
            "workflowMetrics": {"diagnostics": {"route": {"providerStatus": "SUCCESS"}}},
        },
    )

    assert result.actual["route"]["intent"] == "REEL_VIDEO_QUESTION"
    assert result.actual["route"]["referenceTarget"] is None
    assert result.actual["route"]["reelQuestionType"] is None
    assert result.actual["route"]["requiredEvidence"] == []
    assert result.actual["citations"] == []


def test_fixture_result_is_json_round_trip_and_schema_rejects_missing_answer():
    row = list(load_dataset("rag-frozen-ami-v1"))[0]
    result = fixture_execution(row, "run-1", {"variantName": "test"})
    assert NormalizedExecutionResult.model_validate_json(result.model_dump_json()) == result
    payload = json.loads(result.model_dump_json())
    del payload["actual"]["answer"]
    with pytest.raises(ValidationError):
        NormalizedExecutionResult.model_validate(payload)
