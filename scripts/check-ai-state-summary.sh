#!/usr/bin/env sh
set -eu

# Enforce summary updates when app state structure changes.
# Uses grep, not rg: ripgrep is not installed by default, and when `rg` is
# missing the pipeline exits 127 -- which `if !` inverts into "no app.js staged",
# silently disabling this guard instead of failing loudly. grep is always present.
if ! git diff --cached --name-only | grep -qE '^app\.js$'; then
  exit 0
fi

if git diff --cached --name-only | grep -qE '^(AI_STATE_SUMMARY\.txt|AI_STATE_MIN\.txt)$'; then
  exit 0
fi

echo "ERROR: app.js is staged but AI state summaries are not."
echo "Please update and stage:"
echo "  - AI_STATE_SUMMARY.txt"
echo "  - AI_STATE_MIN.txt"
echo ""
echo "If app.js changes do not affect state/constants/flow, stage one summary with a note."
exit 1
