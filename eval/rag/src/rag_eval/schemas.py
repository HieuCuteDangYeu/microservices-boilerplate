"""Versioned dataset and normalized execution contracts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EvaluationRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    datasetVersion: str
    question: str
    referenceAnswer: str | None = None
    expectedIntent: str | None = None
    expectedReferenceTarget: str | None = None
    expectedReelQuestionType: str | None = None
    expectedEvidenceTypes: list[str] = Field(default_factory=list)
    expectedReelIds: list[str] = Field(default_factory=list)
    relevantEvidenceIds: list[str] = Field(default_factory=list)
    accessScope: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    category: str
    language: str = "en"
    fixtureGroup: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class Context(BaseModel):
    model_config = ConfigDict(extra="allow")

    evidenceId: str
    reelId: str | None = None
    evidenceType: str
    text: str | None = None
    rank: int = Field(ge=1)


class Citation(BaseModel):
    model_config = ConfigDict(extra="allow")

    evidenceId: str | None = None
    reelId: str | None = None
    evidenceType: str | None = None
    startTime: float | None = None
    endTime: float | None = None


class ModelCall(BaseModel):
    model_config = ConfigDict(extra="allow")

    modelRole: str
    model: str
    inputTokens: int | None = Field(default=None, ge=0)
    outputTokens: int | None = Field(default=None, ge=0)
    totalTokens: int | None = Field(default=None, ge=0)
    usageSource: Literal["PROVIDER", "ESTIMATED", "UNAVAILABLE"]
    latencyMs: float | None = Field(default=None, ge=0)
    finishReason: str | None = None
    attempt: int = Field(default=1, ge=1)
    providerStatus: int | Literal["NETWORK_ERROR", "TIMEOUT"] | None = None
    providerCategory: str | None = None
    scope: Literal["QUERY", "INDEXING", "EVALUATION_JUDGE"] = "QUERY"


class NormalizedExecutionResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemaVersion: Literal["rag-eval-result-v1"] = "rag-eval-result-v1"
    runId: str
    caseId: str
    executionStatus: Literal[
        "COMPLETED",
        "FIXTURE",
        "PROVIDER_FAILURE",
        "NO_RESPONSE",
        "ROUTER_UNAVAILABLE",
        "RECONCILED_FAILURE",
    ]
    input: dict[str, Any]
    reference: dict[str, Any]
    actual: dict[str, Any]
    trace: dict[str, Any] = Field(default_factory=dict)
    modelCalls: list[ModelCall] = Field(default_factory=list)
    latencyMs: float | None = Field(default=None, ge=0)
    variant: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def enforce_identity(self) -> NormalizedExecutionResult:
        if self.input.get("question") is None:
            raise ValueError("input.question is required")
        if self.executionStatus in {"COMPLETED", "FIXTURE"} and "answer" not in self.actual:
            raise ValueError("completed results must include actual.answer")
        return self
