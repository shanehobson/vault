#!/bin/bash
# Deploy the Vault Lambdas from this directory. Idempotent; safe to re-run.
#
#   ./deploy_lambdas.sh              # deploy getMedia + postMedia + deleteMedia
#   ./deploy_lambdas.sh getMedia     # deploy just one
#
# Settings come from ../.env (see ../.env.example). The previous code of every function
# deployed is saved to backup/<name>-<timestamp>.zip so a rollback is
# `aws lambda update-function-code --zip-file fileb://<that file>`.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../.env ]; then set -a; . ../.env; set +a; fi
: "${AWS_PROFILE:?set AWS_PROFILE in .env}"
: "${MEDIA_BUCKET:?set MEDIA_BUCKET in .env}"
: "${MEDIA_TABLE:?set MEDIA_TABLE in .env}"
export AWS_PROFILE AWS_DEFAULT_REGION="${AWS_REGION:-us-east-2}"

TARGETS=("$@")
if [ ${#TARGETS[@]} -eq 0 ]; then TARGETS=(getMedia postMedia deleteMedia); fi

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backup build

for fn in "${TARGETS[@]}"; do
  [ -f "$fn/index.mjs" ] || { echo "no such function dir: $fn" >&2; exit 1; }

  echo "── $fn"
  node --check "$fn/index.mjs"

  url=$(aws lambda get-function --function-name "$fn" --query Code.Location --output text)
  curl -sf "$url" -o "backup/$fn-$STAMP.zip"
  echo "   backed up current code → backup/$fn-$STAMP.zip"

  # The code reads its bucket/table from the environment; set them before the new code runs.
  aws lambda update-function-configuration --function-name "$fn" \
    --environment "Variables={MEDIA_BUCKET=$MEDIA_BUCKET,MEDIA_TABLE=$MEDIA_TABLE}" \
    --query "{state:State}" --output json
  aws lambda wait function-updated --function-name "$fn"

  (cd "$fn" && zip -q -X "../build/$fn.zip" index.mjs)
  aws lambda update-function-code \
    --function-name "$fn" --zip-file "fileb://build/$fn.zip" \
    --query "{state:State,updated:LastModified}" --output json
  aws lambda wait function-updated --function-name "$fn"
  echo "   deployed"
done

if [ -n "${SMOKE_TEST_USER_ID:-}" ]; then
  echo
  echo "Smoke test (getMedia summary for SMOKE_TEST_USER_ID):"
  aws lambda invoke --function-name getMedia --cli-binary-format raw-in-base64-out \
    --payload "{\"callerSub\":\"$SMOKE_TEST_USER_ID\",\"queryStringParameters\":{\"mode\":\"summary\"}}" \
    /dev/stdout --query 'null' --output text | head -c 800
  echo
fi
