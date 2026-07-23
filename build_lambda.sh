#!/bin/bash
# Build Lambda deployment zip
# Usage: ./build_lambda.sh

set -e

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
