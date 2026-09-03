import json

import pytest

from rag_eval.cli import validate_definitions_report
from rag_eval.dataset import is_supported_live_dataset, load_dataset


def _definitions_for(dataset):
    return {
        "ragBenchmark": {
            "cases": [
                {
                    "caseId": row.id,
                    "reelId": row.expectedReelIds[0],
                    "question": row.question,
                    "referenceAnswerText": row.referenceAnswer,
                    "expectedEvidenceType": row.expectedEvidenceTypes[0],
                    "referenceStartSec": row.metadata["referenceStartSec"],
                    "referenceEndSec": row.metadata["referenceEndSec"],
                }
                for row in dataset
            ]
        }
    }


def test_v2_definitions_must_come_from_the_selected_dataset(tmp_path):
    dataset = list(load_dataset("rag-frozen-ami-v2"))
    path = tmp_path / "definitions.json"
    path.write_text(json.dumps(_definitions_for(dataset)))

    validate_definitions_report(str(path), {row.id: row for row in dataset})


def test_live_dataset_contract_accepts_supported_frozen_versions_only():
    assert is_supported_live_dataset("rag-frozen-ami-v1")
    assert is_supported_live_dataset("rag-frozen-ami-v2")
    assert not is_supported_live_dataset("rag-generalization-v1")
    assert not is_supported_live_dataset("rag-frozen-ami-v3")


def test_definitions_reel_mismatch_is_rejected(tmp_path):
    dataset = list(load_dataset("rag-frozen-ami-v2"))
    payload = _definitions_for(dataset)
    payload["ragBenchmark"]["cases"][0]["reelId"] = (
        "11111111-1111-4111-8111-111111111111"
    )
    path = tmp_path / "definitions.json"
    path.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="reel mismatch"):
        validate_definitions_report(str(path), {row.id: row for row in dataset})
