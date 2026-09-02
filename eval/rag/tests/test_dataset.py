import json
from pathlib import Path

from rag_eval.dataset import load_dataset


def test_versioned_dataset_counts_and_frozen_contract():
    frozen = list(load_dataset("rag-frozen-ami-v1"))
    frozen_v2 = list(load_dataset("rag-frozen-ami-v2"))
    generic = list(load_dataset("rag-generalization-v1"))
    assert len(frozen) == 8
    assert len(frozen_v2) == 8
    assert len(generic) == 104
    assert [row.id for row in frozen] == [
        "IN1001-1",
        "IN1001-2",
        "IN1002-1",
        "IN1002-2",
        "IN1005-1",
        "IN1005-2",
        "IN1007-1",
        "IN1007-2",
    ]
    assert frozen[0].question == "Who is the video shot detector being presented to?"
    assert frozen[-1].referenceAnswer == "Down to about twelve bands."
    assert [row.id for row in frozen_v2] == [row.id for row in frozen]
    assert all(row.datasetVersion == "rag-frozen-ami-v2" for row in frozen_v2)
    assert sum(row.fixtureGroup == "router" for row in generic) == 65
    assert sum(row.fixtureGroup == "sufficiency" for row in generic) == 20
    assert sum(row.fixtureGroup == "verifier" for row in generic) == 15


def test_frozen_v2_preserves_semantics_and_uses_verified_index_snapshot():
    v1 = {row.id: row for row in load_dataset("rag-frozen-ami-v1")}
    v2 = {row.id: row for row in load_dataset("rag-frozen-ami-v2")}
    snapshot = json.loads(
        Path(__file__).parents[1]
        .joinpath("datasets/rag-frozen-ami-v2-index-snapshot.json")
        .read_text()
    )
    evidence = {
        item["id"]: item
        for reel in snapshot["reels"].values()
        for item in reel["evidence"]
    }
    old_reel_ids = {
        reel_id for row in v1.values() for reel_id in row.expectedReelIds
    }

    assert set(v2) == set(v1)
    assert len({reel_id for row in v2.values() for reel_id in row.expectedReelIds}) == 4
    assert not old_reel_ids.intersection(
        reel_id for row in v2.values() for reel_id in row.expectedReelIds
    )
    for case_id, old in v1.items():
        new = v2[case_id]
        assert new.question == old.question
        assert new.referenceAnswer == old.referenceAnswer
        assert new.expectedIntent == old.expectedIntent
        assert new.expectedReferenceTarget == old.expectedReferenceTarget
        assert new.expectedReelQuestionType == old.expectedReelQuestionType
        assert new.expectedEvidenceTypes == old.expectedEvidenceTypes
        assert new.category == old.category
        assert new.language == old.language
        assert new.fixtureGroup == old.fixtureGroup
        assert new.tags == old.tags
        assert new.accessScope == old.accessScope
        assert new.metadata["referenceStartSec"] == old.metadata["referenceStartSec"]
        assert new.metadata["referenceEndSec"] == old.metadata["referenceEndSec"]
        assert new.metadata["expectedConcepts"] == old.metadata["expectedConcepts"]
        assert new.metadata["previousDatasetVersion"] == "rag-frozen-ami-v1"
        assert new.metadata["productionBootstrapSha"] == (
            "1b1a87ae56688c6bf51e5a3db077d3f5b5916632"
        )
        assert all(
            evidence[evidence_id]["active"]
            and evidence[evidence_id]["reelId"] == new.expectedReelIds[0]
            for evidence_id in new.relevantEvidenceIds
        )


def test_generic_dataset_has_required_analysis_slices():
    tags = {tag for row in load_dataset("rag-generalization-v1") for tag in row.tags}
    assert {
        "routing",
        "transcript",
        "visual",
        "metadata",
        "quantitative",
        "causal",
        "relation",
        "summary",
        "multilingual",
        "noisy-asr",
        "normal-chat",
        "access-control",
        "provider-failure",
    } <= tags
