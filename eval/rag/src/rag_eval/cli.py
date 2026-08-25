"""pnpm-facing CLI with offline-safe defaults."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from rag_eval.adapters.cloudflare_judge import build_live_judge, classify_capacity_error
from rag_eval.adapters.runner_output import (
    fixture_execution,
    invoke_typescript_runner,
    load_runner_report,
)
from rag_eval.compare import compare_files
from rag_eval.dataset import ROOT, load_dataset
from rag_eval.experiment import rag_experiment
from rag_eval.reports import build_summary, load_cases, write_report
from rag_eval.schemas import EvaluationRow

RESULTS = ROOT / "results"


def _rows(dataset: Any) -> dict[str, EvaluationRow]:
    return {row.id: row for row in dataset}


def _dicts(experiment_result: Any) -> list[dict[str, Any]]:
    return [
        item.model_dump(mode="json") if hasattr(item, "model_dump") else dict(item)
        for item in experiment_result
    ]


def _variant(args: argparse.Namespace) -> dict[str, Any]:
    try:
        git_sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT.parents[1],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        git_sha = "UNAVAILABLE"
    return {
        "variantName": args.variant,
        "gitSha": git_sha,
        "productionSha": args.production_sha,
        "datasetVersion": args.dataset,
        "pricingVersion": "cloudflare-workers-ai-2026-08-18-v1",
        "embeddingModel": args.embedding_model,
        "routerModel": args.router_model,
        "plannerModel": args.planner_model,
        "answerModel": args.answer_model,
        "verifierModel": args.verifier_model,
        "retrievalK": args.retrieval_k,
        "rerankK": args.rerank_k,
        "promptVersion": args.prompt_version,
    }


async def run_offline(args: argparse.Namespace) -> Path:
    dataset = load_dataset(args.dataset)
    rows = _rows(dataset)
    run_id = args.run_id or f"offline-{args.dataset}-{int(time.time())}"
    variant = _variant(args)
    executions = {case_id: fixture_execution(row, run_id, variant) for case_id, row in rows.items()}
    result = await rag_experiment.arun(
        dataset,
        name=run_id,
        execution_results=executions,
        variant=variant,
    )
    directory = write_report(_dicts(result), run_id, RESULTS)
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    print_terminal_summary(summary)
    print(f"SAMPLE_RAGAS_RUN_ID={run_id}")
    print(f"SAMPLE_RAGAS_REPORT_PATH={directory}")
    return directory


async def run_live(args: argparse.Namespace) -> Path:
    if not args.confirm_live:
        raise SystemExit("LIVE requires --confirm-live; exactly-once runner state is authoritative")
    if args.dataset != "rag-frozen-ami-v1":
        raise SystemExit("the current TypeScript bridge only executes rag-frozen-ami-v1")
    if not args.definitions_report:
        raise SystemExit("LIVE requires --definitions-report")
    dataset = load_dataset(args.dataset)
    rows = _rows(dataset)
    run_id = args.run_id or f"ragas-live-{int(time.time())}"
    runner_args = ["--definitions-report", args.definitions_report, "--run-id", run_id]
    if args.env_file:
        runner_args += ["--env-file", args.env_file]
    report_path = invoke_typescript_runner(runner_args)
    executions = load_runner_report(
        report_path, rows, Path(args.trace_file) if args.trace_file else None
    )
    missing = set(rows) - set(executions)
    if missing:
        raise RuntimeError(f"runner report omitted cases: {sorted(missing)}")
    semantic_suite = None
    if args.live_judge:
        semantic_suite, _client, _model = build_live_judge()
    variant = _variant(args)
    result = await rag_experiment.arun(
        dataset,
        name=run_id,
        execution_results=executions,
        variant=variant,
        semantic_suite=semantic_suite,
    )
    directory = write_report(_dicts(result), run_id, RESULTS)
    print_terminal_summary(json.loads((directory / "summary.json").read_text()))
    return directory


def print_terminal_summary(summary: dict[str, Any]) -> None:
    metric = summary["metrics"]
    semantic = summary["semanticMetrics"]
    cost = summary["cost"]
    latency = summary["latencyMs"]["endToEnd"]
    print("RAG Evaluation")
    print("-" * 50)
    print(f"Dataset                        {summary['dataset']}")
    print(f"Variant                        {summary['variant'].get('variantName')}")
    print(f"Cases                          {summary['caseCount']}")
    print(f"Correct                        {summary['correct']}/{summary['caseCount']}")
    print(f"Correct + grounded             {summary['correctAndGrounded']}/{summary['caseCount']}")
    print(f"Faithfulness                   {semantic.get('faithfulness')}")
    print(f"Factual Correctness            {semantic.get('factual_correctness')}")
    print(f"Response Relevancy             {semantic.get('response_relevancy')}")
    print(f"Context Precision              {semantic.get('context_precision')}")
    print(f"Context Recall                 {semantic.get('context_recall')}")
    print(f"Recall@5                       {metric.get('recallAt5')}")
    print(f"MRR                            {metric.get('mrr')}")
    print(f"Access Violations              {summary['accessControlViolations']}")
    print(f"P50 latency                    {latency.get('p50')}")
    print(f"P95 latency                    {latency.get('p95')}")
    print(f"Production Query Cost          {cost.get('totalQueryCostUsd')}")
    print(f"Evaluation Judge Cost          {cost.get('evaluationJudgeCostUsd')}")
    print("-" * 50)


def run_report(args: argparse.Namespace) -> None:
    directory = RESULTS / args.run
    cases = load_cases(directory)
    summary = build_summary(cases, args.run)
    print_terminal_summary(summary)


def run_compare(args: argparse.Namespace) -> None:
    comparison = compare_files(
        RESULTS / args.baseline / "summary.json", RESULTS / args.candidate / "summary.json"
    )
    print(json.dumps(comparison, indent=2, sort_keys=True))


def run_capacity_check(args: argparse.Namespace) -> None:
    if not args.confirm_one_call and os.getenv("RAG_EVAL_CAPACITY_CHECK_CONFIRM") != "YES":
        raise SystemExit(
            "capacity check requires --confirm-one-call and performs exactly one provider call"
        )
    _suite, client, model = build_live_judge()
    try:
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply OK."}],
            max_tokens=2,
            temperature=0,
        )
    except Exception as error:
        status = getattr(error, "status_code", None)
        body = getattr(error, "body", {}) or {}
        provider = body.get("error", body) if isinstance(body, dict) else {}
        category = classify_capacity_error(
            status, provider.get("code") if isinstance(provider, dict) else None, str(error)
        )
        print(f"CAPACITY_AVAILABLE=NO\nPROVIDER_CATEGORY={category}")
        return
    print("CAPACITY_AVAILABLE=YES")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="rag-eval")
    commands = root.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--dataset", default="rag-frozen-ami-v1")
    common.add_argument("--variant", default="offline-fixture")
    common.add_argument("--run-id")
    common.add_argument("--production-sha")
    common.add_argument("--embedding-model")
    common.add_argument("--router-model")
    common.add_argument("--planner-model")
    common.add_argument("--answer-model")
    common.add_argument("--verifier-model")
    common.add_argument("--retrieval-k", type=int)
    common.add_argument("--rerank-k", type=int)
    common.add_argument("--prompt-version")
    commands.add_parser("offline", parents=[common])
    live = commands.add_parser("live", parents=[common])
    live.add_argument("--confirm-live", action="store_true")
    live.add_argument("--definitions-report")
    live.add_argument("--env-file")
    live.add_argument("--trace-file")
    live.add_argument("--live-judge", action="store_true")
    report = commands.add_parser("report")
    report.add_argument("--run", required=True)
    compare = commands.add_parser("compare")
    compare.add_argument("--baseline", required=True)
    compare.add_argument("--candidate", required=True)
    capacity = commands.add_parser("capacity-check")
    capacity.add_argument("--confirm-one-call", action="store_true")
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "offline":
        asyncio.run(run_offline(args))
    elif args.command == "live":
        asyncio.run(run_live(args))
    elif args.command == "report":
        run_report(args)
    elif args.command == "compare":
        run_compare(args)
    else:
        run_capacity_check(args)
