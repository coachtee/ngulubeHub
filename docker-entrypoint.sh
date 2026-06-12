#!/bin/sh
# Docker entrypoint for Ngulube Hub
# Runs as root first to fix /app/data ownership (in case the named
# volume was created by an earlier container with different UID),
# then drops to the 'ngulube' user to run node.
set -e

# Fix volume ownership if needed
if [ -d /app/data ]; then
  DATA_UID=$(stat -c %u /app/data 2>/dev/null || echo "")
  NGULUBE_UID=$(id -u ngulube)
  if [ "$DATA_UID" != "$NGULUBE_UID" ]; then
    echo "[entrypoint] Fixing /app/data ownership (was uid $DATA_UID, want $NGULUBE_UID)"
    chown -R ngulube:ngulube /app/data 2>/dev/null || \
      echo "[entrypoint] WARN: chown failed (read-only mount?)"
  fi
fi

# Drop privileges and exec the CMD
exec su-exec ngulube "$@"
