#!/bin/sh
# Entrypoint of the n8n container in docker-compose.yml.
# First start only: import and publish the workflows. Later starts leave your
# edits alone.
set -eu

MARK=/home/node/.n8n/.get-workflows-imported

if [ ! -f "$MARK" ]; then
  STAGE=$(mktemp -d)
  node /bootstrap/prepare.mjs /bootstrap/workflows "$STAGE"
  n8n import:credentials --input="$STAGE/credentials.json"
  n8n import:workflow --separate --input="$STAGE/workflows"
  for id in gwByTag000000001 gwByName00000001 gwLab00000000001; do
    n8n publish:workflow --id="$id"
  done
  rm -rf "$STAGE"
  touch "$MARK"
  echo "get-workflows: workflows imported and published"
fi

exec n8n start
