import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

import rag_eval.adapters.runner_output as runner_output


def test_invoke_typescript_runner_parses_report_path(monkeypatch):
    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(stdout='progress\n{"reportPath": "/tmp/report.json"}\n')

    monkeypatch.setattr(runner_output.subprocess, "run", fake_run)

    assert runner_output.invoke_typescript_runner(["--run-id", "test"]) == Path(
        "/tmp/report.json"
    )


def test_invoke_typescript_runner_surfaces_bounded_sanitized_failure(monkeypatch):
    error = subprocess.CalledProcessError(
        17,
        ["node", "runner"],
        output=(
            "password=supersecret "
            "Authorization: Bearer bearer-secret "
            "postgresql://dbuser:dbpassword@example.test/db"
        ),
        stderr=(
            "Cookie: session=session-secret "
            "cloudflare_api_token=cloudflare-secret "
            "index failed at validation"
        ),
    )
    error.stdout = error.output

    def fake_run(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(runner_output.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError) as raised:
        runner_output.invoke_typescript_runner(["--run-id", "test"])

    message = str(raised.value)
    assert "TypeScript runner failed with exit code 17" in message
    assert "index failed at validation" in message
    for secret in (
        "supersecret",
        "bearer-secret",
        "dbpassword",
        "session-secret",
        "cloudflare-secret",
    ):
        assert secret not in message
    assert len(message) < 4200
