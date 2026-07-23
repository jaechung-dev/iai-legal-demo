#!/bin/bash
# Upload Next.js static export to S3 and invalidate CloudFront cache
# Usage: ./deploy_frontend.sh

set -e

BUCKET=$(cd terraform && terraform output -raw s3_bucket)
CF_ID=$(cd terraform && terraform output -raw cloudfront_url | sed 's|https://||' | cut -d'.' -f1)
# Get distribution ID from AWS
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?DomainName!=null] | [?contains(Origins.Items[0].DomainName, '${BUCKET}')].Id | [0]" --output text 2>/dev/null || echo "")

echo "→ Building frontend..."
cd frontend
NEXT_PUBLIC_API_URL=$(cd ../terraform && terraform output -raw api_url) npm run build
cd ..

echo "→ Uploading to s3://${BUCKET}..."
aws s3 sync frontend/out/ s3://${BUCKET}/ --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --exclude "*.json"

aws s3 sync frontend/out/ s3://${BUCKET}/ --delete \
  --cache-control "no-cache" \
  --include "*.html" \
  --include "*.json"

if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
  echo "→ Invalidating CloudFront cache (${DIST_ID})..."
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --output text
fi

echo "✓ Done"
cd terraform && terraform output
