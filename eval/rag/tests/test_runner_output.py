import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

import rag_eval.adapters.runner_output as runner_output


def test_checked_in_jsonl_fixture_has_multiple_rows_and_trailing_newline():
    fixture = Path(__file__).parent / "fixtures" / "two-rows.jsonl"

    assert fixture.read_bytes().endswith(b"\n")
    assert runner_output.load_jsonl(fixture) == [{"row": 1}, {"row": 2}]


def test_jsonl_loader_accepts_multiple_rows_and_trailing_newline(tmp_path):
    path = tmp_path / "rows.jsonl"
    path.write_text('{"row": 1}\n{"row": 2}\n')

    assert runner_output.load_jsonl(path) == [{"row": 1}, {"row": 2}]


def test_jsonl_loader_reports_malformed_line_number(tmp_path):
    path = tmp_path / "rows.jsonl"
    path.write_text('{"row": 1}\nnot-json\n')

    with pytest.raises(ValueError, match=r"line 2"):
        runner_output.load_jsonl(path)


def test_json_loader_reads_one_document(tmp_path):
    path = tmp_path / "document.json"
    path.write_text('{"row": 1}\n')

    assert runner_output.load_json(path) == {"row": 1}


def test_load_runner_report_accepts_jsonl_trace_rows(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(
        '{"runId":"run-jsonl","cases":[{"caseId":"C-1","status":"EVALUATED",'
        '"finalAnswer":"Actual","citations":[]}]}'
    )
    traces = tmp_path / "traces.jsonl"
    traces.write_text(
        '{"caseId":"C-1","traceId":"trace-1","intent":"NORMAL_CHAT",'
        '"workflowMetrics":{"diagnostics":{}}}\n'
    )
    from rag_eval.schemas import EvaluationRow

    row = EvaluationRow(
        id="C-1",
        datasetVersion="test",
        question="Question?",
        referenceAnswer="Actual",
        expectedIntent="NORMAL_CHAT",
        category="test",
        fixtureGroup="test",
    )

    result = runner_output.load_runner_report(report, {row.id: row}, traces)

    assert result["C-1"].trace["ragTraceId"] == "trace-1"


def test_invoke_typescript_runner_parses_report_path(monkeypatch):
    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(stdout='progress\n{"reportPath": "/tmp/report.json"}\n')

    monkeypatch.setattr(runner_output.subprocess, "run", fake_run)

    assert runner_output.invoke_typescript_runner(["--run-id", "test"]) == Path(
        "/tmp/report.json"
    )


def test_invoke_typescript_runner_ignores_json_scalar_progress_lines(monkeypatch):
    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(
            stdout='progress\n"completed"\n{"reportPath": "/tmp/report.json"}\n'
        )

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
