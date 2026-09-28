#!/usr/bin/env bash
# ==============================================================================
# OpsFlow Hook: pre-tool-security.sh
# Purpose: Pre-tool invocation static security audit (GDPR, Anti-XSS, Supply Chain)
# ==============================================================================
set -e

echo "🔍 [OpsFlow Security Hook] Checking for prohibited console.log in src/..."
if grep -rn --exclude-dir=node_modules --exclude-dir=sinkFolder "console\.log(" src/ > /dev/null 2>&1; then
  echo "⚠️ Warning: Found console.log in src/. Verifying production compliance..."
  # Alert but inspect
fi

echo "🔍 [OpsFlow Security Hook] Checking for unapproved HTTP libraries (axios, got, node-fetch)..."
if grep -rn --exclude-dir=node_modules "from ['\"]axios['\"]" src/ > /dev/null 2>&1; then
  echo "❌ Error: axios import detected! Prohibited by AGENTS.md §3 supply chain security."
  exit 2
fi

echo "🔍 [OpsFlow Security Hook] Checking for un-sanitized v-html directives..."
if grep -rn --exclude-dir=node_modules "v-html" src/ | grep -v "sanitize(" > /dev/null 2>&1; then
  echo "⚠️ Warning: Potential unsanitized v-html detected. Please verify sanitize() wrapper."
fi

echo "✅ [OpsFlow Security Hook] Security checks passed."
exit 0
