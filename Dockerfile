# ==============================================================================
# Multi-Stage Dockerfile for gemini-live-dashboard
# Base: Node.js 22 (Debian Bookworm Slim)
# Features: Multi-stage build, minimal native build tools, non-root user,
#           integrated healthcheck, and optional test stage.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Image
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

WORKDIR /app

# ------------------------------------------------------------------------------
# Stage 2: Dependencies and Native Build (Builder)
# Installs python3, make, and g++ required by node-gyp for better-sqlite3
# ------------------------------------------------------------------------------
FROM base AS builder

# Install build dependencies for native node-gyp packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libc6-dev \
 && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install all dependencies (including native module compilation)
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 3: Test Runner (Optional build target: docker build --target test .)
# ------------------------------------------------------------------------------
FROM builder AS test

# Copy application source for running tests
COPY . .

# Run syntax/linter checks and unit/integrity tests
RUN npm run lint && npm run test:unit

# ------------------------------------------------------------------------------
# Stage 4: Production Runtime
# Minimal attack surface, non-root user, lean dependencies
# ------------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=7860

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy application source files
COPY --chown=node:node . .

# Copy built node_modules from builder stage
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Ensure data directories exist and are owned by the non-root node user
RUN mkdir -p /app/ingest-data && chown -R node:node /app

# Switch to non-root user (provided by official Node image)
USER node

# Expose default application port
EXPOSE 7860

# Container healthcheck using the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

# Start production server
CMD ["node", "server.js"]
