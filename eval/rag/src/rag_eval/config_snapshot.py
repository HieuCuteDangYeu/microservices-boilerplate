"""Require deployment provenance for remote live runs; local env is not remote config."""

import json
from pathlib import Path
from typing import Any


def load_runtime_snapshot(
    path: str | None, production_sha: str | None, dataset_version: str
) -> dict[str, Any]:
    if not path:
        raise ValueError("remote live evaluation requires --runtime-config-snapshot")
    snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
    required = {
        "routerPrimaryModel",
        "routerFallbackModel",
        "routerTimeoutMs",
        "routerFallbackTimeoutMs",
        "routerMaxCompletionTokens",
        "structuredReasoningEffort",
        "aiGatewayEnabled",
        "gitSha",
        "datasetVersion",
        "variantName",
        "roles",
    }
    if required - snapshot.keys():
        raise ValueError("runtime config snapshot is incomplete")
    if not production_sha or snapshot["gitSha"] != production_sha:
        raise ValueError("runtime config gitSha must match explicit --production-sha")
    if not dataset_version or snapshot["datasetVersion"] != dataset_version:
        raise ValueError("runtime config dataset mismatch")
    if not snapshot["roles"] or any(
        not {"model", "timeoutMs", "maxCompletionTokens"} <= role.keys()
        for role in snapshot["roles"].values()
    ):
        raise ValueError("runtime role model, timeout and completion budget are required")
    # This file is an operator-supplied deployment attestation, not a local override.
    snapshot["provenance"] = "OPERATOR_SUPPLIED_DEPLOYMENT_SNAPSHOT"
    return snapshot
