import json

from ragas import Dataset

from rag_eval.control_plane import control_plane_experiment
from rag_eval.dataset import load_dataset
from rag_eval.schemas import EvaluationRow


async def test_ragas_scores_recommendation_action_and_retains_safe_schema_diagnostics(tmp_path):
    row = next(row for row in load_dataset("rag-generalization-v1") if row.id == "discovery-01")
    assert row.expectedIntent == "NORMAL_CHAT"
    assert row.expectedRecommendationAction == "RECOMMEND_REELS"
    dataset = Dataset(
        name="router-contract-test",
        backend="local/jsonl",
        data_model=EvaluationRow,
        data=[row],
        root_dir=str(tmp_path),
    )
    observation = {
        "id": row.id,
        "success": True,
        "latencyMs": 1,
        "expectedIntent": "NORMAL_CHAT",
        "actualIntent": "NORMAL_CHAT",
        "expectedReferenceTarget": "NONE",
        "actualReferenceTarget": "NONE",
        "expectedReelQuestionType": "NONE",
        "actualReelQuestionType": "NONE",
        "expectedRequiredEvidence": ["NONE"],
        "actualRequiredEvidence": ["NONE"],
        "expectedRecommendationAction": "RECOMMEND_REELS",
        "actualRecommendationAction": "NONE",
        "calls": [
            {
                "providerStatus": 200,
                "schemaPath": "$.recommendationAction.type",
                "schemaConstraint": "enum",
                "schemaVersion": "router-semantic-v2",
            }
        ],
    }
    results = await control_plane_experiment.arun(
        dataset,
        name="router-contract-test",
        observations={row.id: observation},
        mode="ROUTER",
        model="test",
    )
    result = list(results)[0]
    result = result.model_dump(mode="json") if hasattr(result, "model_dump") else dict(result)
    assert result["metrics"]["intentAccuracy"] == 1
    assert result["metrics"]["recommendationActionAccuracy"] == 0
    assert result["hardGatePassed"] is False
    assert result["modelCalls"][0]["schemaConstraint"] == "enum"
    assert json.loads(json.dumps(result))["modelCalls"][0]["schemaVersion"] == "router-semantic-v2"


def test_all_generic_router_rows_have_explicit_action_labels():
    rows = [row for row in load_dataset("rag-generalization-v1") if row.fixtureGroup == "router"]
    assert len(rows) == 65
    assert all(
        row.expectedRecommendationAction in {"NONE", "RECOMMEND_REELS", "SUGGEST_QUERIES"}
        for row in rows
    )
    assert all(
        row.fixture["expected"]["recommendationAction"] == row.expectedRecommendationAction
        for row in rows
    )
