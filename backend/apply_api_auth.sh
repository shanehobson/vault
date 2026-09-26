#!/bin/bash
# Bind every /media request to the caller's Cognito identity.
#
# The REST API uses non-proxy Lambda integrations, so the Lambdas only see what the
# mapping templates hand them. These templates inject the authorizer's verified `sub`
# as `callerSub`; the Lambdas use that and ignore any client-supplied userId.
# Apply this BEFORE deploying Lambda code that requires callerSub:
#
#   ./apply_api_auth.sh        # update templates + deploy the stage
#   ./deploy_lambdas.sh        # then the Lambdas
#
# Idempotent; safe to re-run. Settings come from ../.env (see ../.env.example).
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../.env ]; then set -a; . ../.env; set +a; fi
: "${AWS_PROFILE:?set AWS_PROFILE in .env}"
: "${REST_API_ID:?set REST_API_ID in .env}"
: "${REST_API_STAGE:=Prod}"
export AWS_PROFILE AWS_DEFAULT_REGION="${AWS_REGION:-us-east-2}"

RESOURCE_ID=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" \
  --query "items[?path=='/media'].id" --output text)
[ -n "$RESOURCE_ID" ] || { echo "no /media resource on API $REST_API_ID" >&2; exit 1; }

read -r -d '' GET_TEMPLATE <<'VTL' || true
{
  "callerSub": "$context.authorizer.claims.sub",
  "queryStringParameters": {
    #foreach($param in $input.params().querystring.keySet())
    "$param": "$util.escapeJavaScript($input.params().querystring.get($param))"
    #if($foreach.hasNext),#end
    #end
  }
}
VTL
read -r -d '' POST_TEMPLATE <<'VTL' || true
{
  "callerSub": "$context.authorizer.claims.sub",
  "files": $input.json('$.files')
}
VTL
read -r -d '' DELETE_TEMPLATE <<'VTL' || true
{
  "callerSub": "$context.authorizer.claims.sub",
  "mediaIds": $input.json('$.mediaIds')
}
VTL

apply() {
  local method=$1 template=$2
  local patch
  patch=$(jq -cn --arg t "$template" '[
    {op:"add", path:"/requestTemplates/application~1json", value:$t},
    {op:"replace", path:"/passthroughBehavior", value:"NEVER"}
  ]')
  aws apigateway update-integration --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method "$method" --patch-operations "$patch" --query "{method:httpMethod,passthrough:passthroughBehavior}" --output json
}

apply GET "$GET_TEMPLATE"
apply POST "$POST_TEMPLATE"
apply DELETE "$DELETE_TEMPLATE"

aws apigateway create-deployment --rest-api-id "$REST_API_ID" --stage-name "$REST_API_STAGE" \
  --description "Inject authorizer sub as callerSub" --query "{deployment:id}" --output json
echo "Stage $REST_API_STAGE now injects callerSub. Next: ./deploy_lambdas.sh"
