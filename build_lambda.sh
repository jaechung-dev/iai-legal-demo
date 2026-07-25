#!/bin/bash
# Build Lambda deployment zips
# Usage: ./build_lambda.sh

set -e

# ── Main API Lambda ────────────────────────────────────────────────────────────
echo "→ Installing dependencies for Lambda (Python 3.12, linux/x86_64)..."
rm -rf lambda_pkg
pip3 install \
  --platform manylinux2014_x86_64 \
  --python-version 3.12 \
  --only-binary=:all: \
  --target lambda_pkg \
  -r requirements.txt -q

echo "→ Copying source files..."
cp main.py lambda_pkg/

echo "→ Zipping..."
cd lambda_pkg
zip -r ../lambda.zip . -q
cd ..
rm -rf lambda_pkg

SIZE=$(du -sh lambda.zip | cut -f1)
echo "✓ lambda.zip ready ($SIZE)"

# ── MCP Lambda ─────────────────────────────────────────────────────────────────
echo "→ Installing dependencies for MCP Lambda (Python 3.12, linux/x86_64)..."
rm -rf mcp_lambda_pkg
pip3 install \
  --platform manylinux2014_x86_64 \
  --python-version 3.12 \
  --only-binary=:all: \
  --target mcp_lambda_pkg \
  -r requirements.txt -q

echo "→ Copying MCP source files..."
cp mcp_server.py mcp_lambda_pkg/

echo "→ Zipping..."
cd mcp_lambda_pkg
zip -r ../mcp_lambda.zip . -q
cd ..
rm -rf mcp_lambda_pkg

MCP_SIZE=$(du -sh mcp_lambda.zip | cut -f1)
echo "✓ mcp_lambda.zip ready ($MCP_SIZE)"
