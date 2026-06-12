# Ngulube Hub — production Dockerfile
# Multi-stage build for a small final image.
# Runs as root by default to avoid volume-ownership issues with
# pre-existing named volumes (a known papercut with non-root + Docker).

# ---------- Stage 1: install deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget tini

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure the data dir exists
RUN mkdir -p /app/data /app/logs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# tini = proper signal handling for PID 1
# We run as root (uid 0) to avoid the "readonly database" issue that
# happens when a named volume is mounted and the file inside is owned
# by a different UID than the process. This is a deliberate trade-off
# for a single-tenant CRM where the threat model does not warrant
# non-root user isolation.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
