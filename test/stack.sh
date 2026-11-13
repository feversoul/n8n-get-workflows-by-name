#!/bin/sh
# test/stack.sh up|down|logs   the test stack by hand
cd "$(dirname "$0")/.."
files="-f docker-compose.yml -f test/docker-compose.yml"
case "$1" in
  up) docker compose --env-file test/test.env $files -p getwf-test up -d ;;
  down) docker compose --env-file test/test.env $files -p getwf-test down -v ;;
  logs) docker compose --env-file test/test.env $files -p getwf-test logs --tail "${TAIL:-40}" n8n ;;
  *) docker compose --env-file test/test.env $files -p getwf-test "$@" ;;
esac
