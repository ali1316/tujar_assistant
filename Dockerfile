# ==============================================================================
# Two-Stage Dockerfile for gemini-live-dashboard / tujar_assistant
# Optimized for free container hosts (SnapDeploy Small, Koyeb, Render, HF)
# Limit: <= 2 build stages for 512MB RAM free containers
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependencies and Native Build (Builder)
# Installs python3, make, and g++ required by node-gyp for better-sqlite3
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libc6-dev \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node . .
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/ingest-data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "server.js"]
