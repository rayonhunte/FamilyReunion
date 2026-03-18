#!/usr/bin/env bash
# Apply storage-cors.json to every default Firebase bucket that exists for this project.
# Run from repo root: npm run storage:cors
# Requires: gcloud auth + gsutil, project with Storage enabled.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${1:-gtfast-7bf85}"
CORS_FILE="$ROOT/storage-cors.json"

if [[ ! -f "$CORS_FILE" ]]; then
  echo "Missing $CORS_FILE"
  exit 1
fi

gcloud config set project "$PROJECT" >/dev/null

for BUCKET in "${PROJECT}.firebasestorage.app" "${PROJECT}.appspot.com"; do
  GS="gs://${BUCKET}"
  if gsutil ls -b "$GS" &>/dev/null; then
    echo "Applying CORS → $GS"
    gsutil cors set "$CORS_FILE" "$GS"
    echo "Current CORS for $GS:"
    gsutil cors get "$GS" || true
    echo ""
  else
    echo "(skip) No bucket or no access: $GS"
  fi
done
echo "Done. Hard-refresh the site and retry uploads."
