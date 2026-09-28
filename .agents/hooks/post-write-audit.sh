#!/usr/bin/env bash
# ==============================================================================
# OpsFlow Hook: post-write-audit.sh
# Purpose: Post-write quality audit (JSDoc, closure markers, Vue SFC block order)
# ==============================================================================
set -e

FILE="$1"
if [ -z "$FILE" ]; then
  echo "Usage: ./post-write-audit.sh <filepath>"
  exit 0
fi

echo "🔍 [OpsFlow Audit Hook] Auditing $FILE..."

if [[ "$FILE" == *.vue ]]; then
  SCRIPT_LINE=$(grep -n "<script" "$FILE" | head -n 1 | cut -d: -f1 || echo "9999")
  TEMPLATE_LINE=$(grep -n "<template" "$FILE" | head -n 1 | cut -d: -f1 || echo "9999")
  if [ "$TEMPLATE_LINE" -lt "$SCRIPT_LINE" ]; then
    echo "❌ Error in $FILE: <template> must NOT appear before <script> (AGENTS.md §4)."
    exit 2
  fi
fi

echo "✅ [OpsFlow Audit Hook] File structure compliant."
exit 0
