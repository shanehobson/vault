#!/bin/bash
# Build and deploy the Vault frontend to S3 + CloudFront.
# Settings come from .env (see .env.example); nothing is hardcoded here.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${AWS_PROFILE:?set AWS_PROFILE in .env}"
: "${WEB_BUCKET:?set WEB_BUCKET in .env}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?set CLOUDFRONT_DISTRIBUTION_ID in .env}"
export AWS_PROFILE AWS_DEFAULT_REGION="${AWS_REGION:-us-east-2}"

npm run build
aws s3 sync dist/ "s3://$WEB_BUCKET/" --cache-control "max-age=300"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" \
  --query "Invalidation.{id:Id,status:Status}" --output json
echo "Deployed to https://${CLOUDFRONT_DOMAIN:-<your CloudFront domain>}/"
