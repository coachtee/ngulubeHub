# Ngulube Hub — production Dockerfile
# Multi-stage build for a small final image.

# ---------- Stage 1: install deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Install build tools for better-sqlite3 native compile
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-alpine
WORKDIR /app

# Install wget for the healthcheck
RUN apk add --no-cache wget tini

# Create non-root user
RUN addgroup -S ngulube && adduser -S ngulube -G ngulube
RUN mkdir -p /app/data /app/logs && chown -R ngulube:ngulube /app

# Copy deps from build stage
COPY --from=deps --chown=ngulube:ngulube /app/node_modules ./node_modules
COPY --chown=ngulube:ngulube . .

USER ngulube

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# Use a small startup script that runs as root to fix volume ownership
# (when a volume was created by an older container running as a different
# user, the SQLite file ends up owned by the wrong UID and writes fail).
# Then it drops privileges to the 'ngulube' user via su-exec.
RUN apk add --no-cache su-exec
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# tini = proper signal handling for PID 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
