#!/bin/bash
# Upload the Vite static build to S3 and invalidate CloudFront cache.
# Usage: ./deploy_frontend.sh
#
# NOTE: the app was migrated Next.js -> Vite. Vite builds to frontend/dist/
# (see frontend/vite.config.ts `outDir`). The old frontend/out/ directory is a
# STALE Next.js export that still contains crawlable deep-link pages such as
# /chat/index.html titled "Legal Intelligence Platform" — syncing it is what let
# Google index /chat instead of the landing page. Always sync frontend/dist/.

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
# Long-cache the fingerprinted assets, but never cache HTML or the SEO files
# (robots.txt / sitemap.xml) so crawlers and browsers always get the latest.
aws s3 sync frontend/dist/ s3://${BUCKET}/ --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --exclude "*.json" \
  --exclude "robots.txt" \
  --exclude "sitemap.xml"

aws s3 sync frontend/dist/ s3://${BUCKET}/ --delete \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html" \
  --include "*.json" \
  --include "robots.txt" \
  --include "sitemap.xml"

if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
  echo "→ Invalidating CloudFront cache (${DIST_ID})..."
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --output text
fi

echo "✓ Done"
cd terraform && terraform output
