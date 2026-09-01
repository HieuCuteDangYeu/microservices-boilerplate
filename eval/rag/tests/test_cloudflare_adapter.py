from rag_eval.adapters.cloudflare_judge import (
    build_capacity_client,
    capacity_message_class,
    classify_capacity_error,
)


def test_4006_requires_safe_message_evidence(monkeypatch):
    assert classify_capacity_error(429, 4006, "opaque provider failure") == (
        "UNKNOWN_PROVIDER_FAILURE"
    )
    message = "Daily allocation limit has been reached."
    assert classify_capacity_error(429, 4006, message) == "ACCOUNT_LIMITED"
    assert capacity_message_class(message) == "DAILY_ALLOCATION_ACCOUNT_LIMIT"


def test_capacity_client_is_independent_from_ragas_judge(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-token")
    monkeypatch.delenv("RAG_EVAL_JUDGE_MODEL", raising=False)
    monkeypatch.delenv("RAG_EVAL_EMBEDDING_MODEL", raising=False)
    client, model = build_capacity_client()
    assert model == "@cf/openai/gpt-oss-20b"
    assert client.max_retries == 0
