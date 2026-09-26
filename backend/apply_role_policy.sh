#!/bin/bash
# Grant the getMedia Lambda role read access to the media table (and its GSIs) and bucket.
# Renders getMedia/role-policy.json from ../.env and applies it. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../.env ]; then set -a; . ../.env; set +a; fi
: "${AWS_PROFILE:?}" "${AWS_ACCOUNT_ID:?}" "${MEDIA_BUCKET:?}" "${MEDIA_TABLE:?}" "${GET_MEDIA_ROLE_NAME:?}"
export AWS_PROFILE AWS_REGION="${AWS_REGION:-us-east-2}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-2}"
export AWS_ACCOUNT_ID MEDIA_BUCKET MEDIA_TABLE

aws iam put-role-policy --role-name "$GET_MEDIA_ROLE_NAME" \
  --policy-name MediaFileAndMetadataAccess \
  --policy-document "$(envsubst < getMedia/role-policy.json)"
echo "Applied MediaFileAndMetadataAccess to $GET_MEDIA_ROLE_NAME"
