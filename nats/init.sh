#!/bin/sh
# Mirror the server's results/plans (kept 1 h) into streams kept forever.
# Origins are created by the server on startup, so wait for them.
set -e

mirror() {
  until nats stream info "$1" >/dev/null 2>&1; do
    echo "waiting for stream $1"
    sleep 2
  done
  nats stream info "$2" >/dev/null 2>&1 ||
    nats stream add "$2" --mirror "$1" --max-age 0 --allow-direct --defaults
}

mirror CASE_RESULTS CASE_ARCHIVE
mirror CASE_PLANS PLAN_ARCHIVE
echo "mirrors ready"
