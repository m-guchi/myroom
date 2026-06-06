#!/usr/bin/env bash
# Send a GitHub Actions result to Discord via webhook.
# Requires: DISCORD_WEBHOOK_URL, NOTIFY_STATUS (success|failure|cancelled)
set -euo pipefail

if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
  echo "DISCORD_WEBHOOK_URL not set; skipping Discord notification"
  exit 0
fi

status="${NOTIFY_STATUS:-unknown}"
workflow_name="${NOTIFY_WORKFLOW:-${GITHUB_WORKFLOW:-GitHub Actions}}"
job_name="${NOTIFY_JOB:-${GITHUB_JOB:-}}"
ref_name="${GITHUB_REF_NAME:-}"
sha="${GITHUB_SHA:-}"
sha_short="${sha:0:7}"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

case "$status" in
  success)
    emoji="✅"
    color=5763719
    status_label="成功"
    ;;
  failure)
    emoji="❌"
    color=15548997
    status_label="失敗"
    ;;
  cancelled)
    emoji="⚪"
    color=9807270
    status_label="キャンセル"
    ;;
  *)
    emoji="ℹ️"
    color=3447003
    status_label="$status"
    ;;
esac

title="${emoji} ${workflow_name} ${status_label}"

export NOTIFY_STATUS="$status"
export NOTIFY_WORKFLOW="$workflow_name"
export NOTIFY_JOB="$job_name"
export SHA_SHORT="$sha_short"
export RUN_URL="$run_url"
export EMOJI="$emoji"
export COLOR="$color"
export TITLE="$title"

payload=$(python3 - <<'PY'
import json
import os

workflow_name = os.environ["NOTIFY_WORKFLOW"]
job_name = os.environ.get("NOTIFY_JOB", "")
event_name = os.environ.get("GITHUB_EVENT_NAME", "")
ref_name = os.environ.get("GITHUB_REF_NAME", "")
sha_short = os.environ.get("SHA_SHORT", "")
actor = os.environ.get("GITHUB_ACTOR", "")
run_url = os.environ.get("RUN_URL", "")
color = int(os.environ["COLOR"])
title = os.environ["TITLE"]

fields = []
if job_name:
    fields.append({"name": "Job", "value": job_name, "inline": True})
if event_name:
    fields.append({"name": "Event", "value": event_name, "inline": True})
if ref_name:
    fields.append({"name": "Branch", "value": ref_name, "inline": True})
if sha_short:
    fields.append({"name": "Commit", "value": f"`{sha_short}`", "inline": True})
if actor:
    fields.append({"name": "Actor", "value": actor, "inline": True})
fields.append({"name": "Run", "value": f"[Workflow Run]({run_url})", "inline": False})

print(json.dumps({
    "embeds": [{
        "title": title,
        "color": color,
        "fields": fields,
    }]
}))
PY
)

curl -fsS \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "$DISCORD_WEBHOOK_URL"
