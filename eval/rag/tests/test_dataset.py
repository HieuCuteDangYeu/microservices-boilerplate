from rag_eval.dataset import load_dataset


def test_versioned_dataset_counts_and_frozen_contract():
    frozen = list(load_dataset("rag-frozen-ami-v1"))
    generic = list(load_dataset("rag-generalization-v1"))
    assert len(frozen) == 8
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
    assert sum(row.fixtureGroup == "router" for row in generic) == 65
    assert sum(row.fixtureGroup == "sufficiency" for row in generic) == 20
    assert sum(row.fixtureGroup == "verifier" for row in generic) == 15


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
