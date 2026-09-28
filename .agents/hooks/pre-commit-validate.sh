#!/usr/bin/env bash
# ==============================================================================
# OpsFlow Hook: pre-commit-validate.sh
# Purpose: Enforces zero-error typechecking, linting and backend compilation
# ==============================================================================
set -e

echo "🔍 [OpsFlow Pre-Commit Hook] Validating branch..."
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "❌ Error: Commits are allowed ONLY on the 'dev' branch (Current: $CURRENT_BRANCH)."
  exit 2
fi

echo "🔍 [OpsFlow Pre-Commit Hook] Checking frontend formatting and linter..."
yarn lint:check

echo "🔍 [OpsFlow Pre-Commit Hook] Checking frontend TypeScript..."
yarn typecheck

echo "🔍 [OpsFlow Pre-Commit Hook] Compiling backend Cloud Functions..."
(cd opsflow-functions && npm run build)

echo "✅ [OpsFlow Pre-Commit Hook] All validations passed successfully!"
exit 0
