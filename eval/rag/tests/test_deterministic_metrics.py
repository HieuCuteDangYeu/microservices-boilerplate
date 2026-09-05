import pytest

from rag_eval.evaluate import evaluate_case
from rag_eval.metrics.citation import (
    citation_evidence_hit_rate,
    citation_precision,
    citation_recall,
    wrong_modality_count,
    wrong_reel_count,
)
from rag_eval.metrics.retrieval import evidence_hit_rate, ndcg_at_k, recall_at_k, reciprocal_rank
from rag_eval.metrics.routing import exact_accuracy, modality_accuracy, set_accuracy
from rag_eval.metrics.safety import access_control_violations
from rag_eval.schemas import EvaluationRow, NormalizedExecutionResult


def test_retrieval_metrics():
    retrieved = ["noise", "e2", "e1", "other"]
    relevant = ["e1", "e2"]
    assert recall_at_k(retrieved, relevant, 1) == 0
    assert recall_at_k(retrieved, relevant, 3) == 1
    assert reciprocal_rank(retrieved, relevant) == 0.5
    assert ndcg_at_k(retrieved, relevant, 5) == pytest.approx(
        (1 / 1.584962500721156 + 1 / 2) / (1 + 1 / 1.584962500721156)
    )
    assert evidence_hit_rate(retrieved, relevant) == 1
    assert recall_at_k(retrieved, [], 5) is None


def test_citation_and_wrong_scope_metrics():
    citations = [
        {"evidenceId": "e1", "reelId": "r1", "evidenceType": "TRANSCRIPT"},
        {"evidenceId": "bad", "reelId": "r2", "evidenceType": "VISUAL"},
    ]
    assert citation_precision(citations, ["e1", "e2"]) == 0.5
    assert citation_recall(citations, ["e1", "e2"]) == 0.5
    assert citation_evidence_hit_rate(citations, ["e1"]) == 1
    assert wrong_reel_count(citations, ["r1"]) == 1
    assert wrong_modality_count(citations, ["TRANSCRIPT"]) == 1


def test_router_modality_and_access_metrics():
    assert exact_accuracy("REEL_VIDEO_QUESTION", "REEL_VIDEO_QUESTION") == 1
    assert set_accuracy(["METADATA", "TRANSCRIPT"], ["TRANSCRIPT", "METADATA"]) == 1
    assert modality_accuracy(["TRANSCRIPT"], ["TRANSCRIPT"]) == 1
    assert modality_accuracy(["UNKNOWN"], ["TRANSCRIPT"]) is None
    assert (
        access_control_violations(
            [{"evidenceId": "e-bad", "reelId": "r-bad"}],
            [{"evidenceId": "e1", "reelId": "r1"}],
            ["r1"],
            ["e1"],
        )
        == 2
    )


def test_evaluate_case_uses_persisted_runtime_access_scope():
    row = EvaluationRow(
        id="generic-access-scope",
        datasetVersion="rag-generalization-v1",
        question="Which authorized evidence is returned?",
        referenceAnswer="The authorized evidence.",
        expectedIntent="REEL_VIDEO_QUESTION",
        expectedReelIds=["target-reel"],
        relevantEvidenceIds=["target-evidence"],
        expectedEvidenceTypes=["TRANSCRIPT"],
        category="access-control",
        fixtureGroup="retrieval",
        accessScope={"policy": "AUTHORIZED_CONTEXT_ONLY"},
    )
    execution = NormalizedExecutionResult(
        runId="generic-access-scope-run",
        caseId=row.id,
        executionStatus="COMPLETED",
        input={"question": row.question},
        reference={},
        actual={
            "answer": row.referenceAnswer,
            "route": {"requiredEvidence": ["TRANSCRIPT"]},
            "retrievedContexts": [
                {
                    "evidenceId": "other-evidence",
                    "reelId": "other-authorized-reel",
                    "evidenceType": "TRANSCRIPT",
                    "rank": 1,
                }
            ],
            "rerankedContexts": [],
            "citations": [],
        },
        trace={
            "diagnostics": {
                "retrievalExecution": {
                    "accessibleReelIds": ["target-reel", "other-authorized-reel"],
                    "accessibleReelIdsTruncated": False,
                }
            }
        },
    )

    result = evaluate_case(row, execution)
    assert result["deterministic"]["accessControlViolations"] == 0
