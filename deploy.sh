#!/usr/bin/env bash
# Ngulube Hub — one-command deploy for the VPS.
# Usage (on the VPS): ./deploy.sh
# What it does:
#   1. Pulls the latest code from GitHub (if reachable)
#   2. Rebuilds the ngulubehub:1.2 image
#   3. Removes the old container (preserves the named volume -> DB survives)
#   4. Starts a fresh container with all the env vars
#   5. Waits 3s and prints the container status
set -euo pipefail

# -------- CONFIGURE THESE --------
SESSION_SECRET="${SESSION_SECRET:-b0695917b832411b3bcb498bc71ff931cb8370002527758273bc16dd7c4f8b770aa90480c505e4bbd3aa7d41e2ed2357}"
IMAGE_TAG="${IMAGE_TAG:-ngulubehub:1.2}"
CONTAINER_NAME="ngulubehub"
HOST_PORT="3200"
CONTAINER_PORT="3000"
VOLUME_NAME="ngulubehub-data"
REPO_DIR="${REPO_DIR:-$HOME/ngulubehub}"
# ---------------------------------

cd "$REPO_DIR"

echo "==> [1/5] Pulling latest from origin/main (best effort)"
if git remote -v | grep -q origin; then
  git pull --ff-only origin main 2>&1 | tail -2 || echo "  (git pull skipped or failed — continuing with local code)"
else
  echo "  (no git remote configured — building local code)"
fi

echo "==> [2/5] Building image $IMAGE_TAG"
docker build -t "$IMAGE_TAG" . 2>&1 | tail -5

echo "==> [3/5] Removing old container (if any) — DB volume is preserved"
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "==> [4/5] Starting fresh container"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e NODE_ENV=production \
  -e PORT="$CONTAINER_PORT" \
  -v "${VOLUME_NAME}:/app/data" \
  "$IMAGE_TAG"
# Note: the container's entrypoint script fixes /app/data ownership
# automatically. No chown step needed here.

echo "==> [5/5] Waiting 3s and checking health"
sleep 3
docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo
echo "Health check (from VPS):"
curl -fsS "http://localhost:${HOST_PORT}/health" || echo "  (health check failed — check docker logs)"
echo
echo "✅ Done. Site: https://ngulube.naleli.co.za"
echo "   Logs:   docker logs -f $CONTAINER_NAME"
