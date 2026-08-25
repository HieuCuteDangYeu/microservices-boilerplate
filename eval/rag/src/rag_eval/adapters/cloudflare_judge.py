"""Evaluation-only OpenAI-compatible Cloudflare adapter."""

import os
import threading
import time
from contextvars import ContextVar
from typing import Any

from openai import OpenAI
from ragas.embeddings import embedding_factory
from ragas.llms import llm_factory

from rag_eval.metrics.semantic import build_live_semantic_suite

_usage_key: ContextVar[str | None] = ContextVar("rag_eval_judge_usage_key", default=None)


class JudgeUsageTracker:
    def __init__(self, client: OpenAI):
        self._calls: dict[str, list[dict[str, Any]]] = {}
        self._lock = threading.Lock()
        original = client.chat.completions.create

        def tracked_create(*args: Any, **kwargs: Any) -> Any:
            started = time.monotonic()
            try:
                response = original(*args, **kwargs)
            except Exception as error:
                key = _usage_key.get()
                if key:
                    status = getattr(error, "status_code", None)
                    body = getattr(error, "body", {}) or {}
                    provider = body.get("error", body) if isinstance(body, dict) else {}
                    call = {
                        "modelRole": "EVALUATION_JUDGE",
                        "model": kwargs.get("model", "UNKNOWN"),
                        "inputTokens": None,
                        "outputTokens": None,
                        "totalTokens": None,
                        "usageSource": "UNAVAILABLE",
                        "latencyMs": (time.monotonic() - started) * 1000,
                        "finishReason": None,
                        "attempt": 1,
                        "providerStatus": status,
                        "providerCategory": classify_capacity_error(
                            status,
                            provider.get("code") if isinstance(provider, dict) else None,
                            str(error),
                        ),
                        "scope": "EVALUATION_JUDGE",
                    }
                    with self._lock:
                        self._calls.setdefault(key, []).append(call)
                raise
            usage = getattr(response, "usage", None)
            key = _usage_key.get()
            if key:
                call = {
                    "modelRole": "EVALUATION_JUDGE",
                    "model": kwargs.get("model", "UNKNOWN"),
                    "inputTokens": getattr(usage, "prompt_tokens", None),
                    "outputTokens": getattr(usage, "completion_tokens", None),
                    "totalTokens": getattr(usage, "total_tokens", None),
                    "usageSource": "PROVIDER" if usage else "UNAVAILABLE",
                    "latencyMs": (time.monotonic() - started) * 1000,
                    "finishReason": None,
                    "attempt": 1,
                    "providerStatus": 200,
                    "scope": "EVALUATION_JUDGE",
                }
                with self._lock:
                    self._calls.setdefault(key, []).append(call)
            return response

        client.chat.completions.create = tracked_create

    def begin(self, key: str) -> None:
        _usage_key.set(key)
        with self._lock:
            self._calls[key] = []

    def take(self, key: str) -> list[dict[str, Any]]:
        _usage_key.set(None)
        with self._lock:
            return self._calls.pop(key, [])


def cloudflare_base_url() -> str:
    configured = os.getenv("RAG_EVAL_CLOUDFLARE_BASE_URL")
    if configured:
        return configured.rstrip("/")
    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1"


def build_live_judge() -> tuple[Any, Any, Any]:
    judge_model = os.environ["RAG_EVAL_JUDGE_MODEL"]
    embedding_model = os.environ["RAG_EVAL_EMBEDDING_MODEL"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    client = OpenAI(api_key=token, base_url=cloudflare_base_url())
    usage_tracker = JudgeUsageTracker(client)
    llm = llm_factory(model=judge_model, provider="openai", client=client)
    embeddings = embedding_factory(provider="openai", model=embedding_model, client=client)
    return (
        build_live_semantic_suite(llm, embeddings, usage_tracker),
        client,
        judge_model,
    )


def classify_capacity_error(status: int | None, code: int | None, message: str) -> str:
    normalized = message.lower()
    if status == 429 and (code == 3036 or "daily" in normalized and "allocation" in normalized):
        return "ACCOUNT_LIMITED"
    if status == 429 and code == 3040:
        return "OUT_OF_CAPACITY"
    if status == 429:
        return "RATE_LIMITED"
    return "UNKNOWN_PROVIDER_FAILURE"
