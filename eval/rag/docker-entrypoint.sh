#!/bin/sh

set -eu

if [ "$(id -u)" -eq 0 ]; then
  for directory in \
    /workspace/eval/rag/results \
    /workspace/eval/rag/experiments \
    /workspace/test-data/reel-integration/ami/reports
  do
    mkdir -p "$directory"
    chown -R eval:eval "$directory"
  done
  exec runuser --preserve-environment --user eval -- "$@"
fi

exec "$@"
