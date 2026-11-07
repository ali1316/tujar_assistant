# Docker & DevOps Guide: gemini-live-dashboard

This document provides a comprehensive operational guide for building, running, testing, and deploying the **gemini-live-dashboard** application using Docker, Docker Compose, and GitHub Actions CI.

---

## 1. Architecture Overview

The containerized stack consists of two services running inside an isolated bridge network:

```
                          ┌─────────────────────────────────────┐
                          │            Docker Host              │
                          │                                     │
   User Browser ──────────┼──► Port 3000: gemini-live-app       │
   (HTTP / WebSockets)    │     (Node.js 22 Bookworm Slim)      │
                          │     • Non-root user (`node`)        │
                          │     • Built with native node-gyp    │
                          │     • In-memory / file upload       │
                          │     • Persistent volume: app_data   │
                          │                │                    │
                          │                ▼ (DATABASE_URL)     │
                          │    Port 5432: gemini-live-db        │
                          │     (PostgreSQL 16 Alpine)          │
                          │     • pg_isready healthcheck        │
                          │     • Persistent volume: pgdata     │
                          └─────────────────────────────────────┘
```

- **App Service (`gemini-live-app`)**:
  - Based on `node:22-bookworm-slim`.
  - Multi-stage build isolates native compilation tools (`python3`, `make`, `g++`, `libc6-dev`) from the final runtime image.
  - Runs under the unprivileged `node` user (UID 1000).
  - Healthcheck polls `http://localhost:3000/health`.
  - Automatically connects to PostgreSQL via `DATABASE_URL` with fallback to local SQLite.
- **Database Service (`gemini-live-db`)**:
  - Based on `postgres:16-alpine`.
  - Includes automated health check (`pg_isready`).
  - Stores database tables in the persistent named volume `gemini-live-pgdata`.

---

## 2. Prerequisites

- **Docker**: Version 20.10.0 or higher
- **Docker Compose**: Version 2.20.0 or higher
- **Gemini API Key**: Obtainable from [Google AI Studio](https://aistudio.google.com/)

---

## 3. Quick Start

### Step 1: Clone and Configure Environment

Copy the example configuration to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and set your `GEMINI_API_KEY`:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### Step 2: Build and Start Stack

Run the stack in detached mode:

```bash
docker compose up -d --build
```

Docker Compose will:
1. Build the multi-stage Node 22 application image.
2. Pull and start PostgreSQL 16 Alpine.
3. Wait for PostgreSQL to become healthy via `pg_isready`.
4. Launch the application container attached to the PostgreSQL instance.

### Step 3: Verify Container Health

Check service status:

```bash
docker compose ps
```

Expected output:
```
NAME              IMAGE                     COMMAND                  SERVICE   STATUS                    PORTS
gemini-live-app   gemini-live-app           "docker-entrypoint.s…"   app       running (healthy)         0.0.0.0:3000->3000/tcp
gemini-live-db    postgres:16-alpine        "docker-entrypoint.s…"   db        running (healthy)         0.0.0.0:5432->5432/tcp
```

Test application health endpoint:

```bash
curl http://localhost:3000/health
# Response: ok
```

Open your browser at: **[http://localhost:3000](http://localhost:3000)**

---

## 4. Common Operations & Commands

### Viewing Logs

Stream logs from all services:
```bash
docker compose logs -f
```

Stream logs from the application only:
```bash
docker compose logs -f app
```

Stream database logs:
```bash
docker compose logs -f db
```

### Stopping and Starting

Stop containers without removing data:
```bash
docker compose stop
```

Start stopped containers:
```bash
docker compose start
```

Stop and remove containers and network:
```bash
docker compose down
```

### Full Data Reset (Wipe Volumes)

To stop containers and completely clear the database and uploaded data:
```bash
docker compose down -v
```

### Opening a Shell Inside the App Container

To inspect files or run diagnostic commands as the non-root `node` user:
```bash
docker compose exec app sh
```

### Accessing PostgreSQL CLI (psql)

Connect directly to the database:
```bash
docker compose exec db psql -U postgres -d gemini_dashboard
```

List database tables:
```sql
\dt
```

---

## 5. Testing with Docker

### Multi-Stage Test Target

The `Dockerfile` includes a dedicated `test` stage that compiles native dependencies and runs syntax and unit tests in the container environment:

```bash
docker build --target test -t gemini-live-dashboard:test .
```

This verifies:
- `better-sqlite3` native compilation on Linux.
- ECMAScript syntax and module resolution (`npm run lint`).
- Data integrity, dataset matching, and prompt guard tests (`npm run test:unit`).

### Running Tests in an Existing Stack

You can also run tests inside a container using compose:

```bash
docker compose run --rm app npm test
```

---

## 6. Standalone Container Usage

If you prefer to run the application as a standalone container without PostgreSQL (using SQLite fallback):

```bash
# Build the production image
docker build -t gemini-live-dashboard:latest .

# Run standalone with SQLite storage
docker run -d \
  --name gemini-dashboard \
  -p 3000:3000 \
  -e GEMINI_API_KEY="your_api_key_here" \
  gemini-live-dashboard:latest
```

---

## 7. Environment Variables Reference

| Variable | Default Value | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(required)* | Google Gemini API key for live voice and reasoning |
| `GEMINI_MODEL` | `gemini-3.8-live` | Model ID used for real-time bidirectional sessions |
| `GEMINI_VOICE` | `Sulafat` | Assistant voice (`Sulafat`, `Kore`, `Aoede`, etc.) |
| `GEMINI_API_VERSION` | `v1alpha` | Gemini Live API protocol version |
| `PORT` | `3000` | HTTP port exposed by the server |
| `DATABASE_URL` | *(compose url)* | PostgreSQL connection string. If unset, falls back to SQLite |
| `POSTGRES_USER` | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL password |
| `POSTGRES_DB` | `gemini_dashboard` | PostgreSQL database name |
| `ACCESS_CODE` | *(empty)* | Optional passcode required for UI and API access |
| `LOCK_CONFIG` | `true` | Restrict dynamic runtime configuration updates |
| `ALLOW_WRITES` | `true` | Allow AI tools to perform database/memory writes |
| `INGEST_STORAGE` | `local` | Document storage engine (`local` or `drive`) |
| `INGEST_LOCAL_DIR` | `/app/ingest-data` | Local directory for uploaded files |

---

## 8. Continuous Integration (GitHub Actions)

The repository includes a GitHub Actions pipeline configured in `.github/workflows/ci.yml`.

### Triggers
- Automatic triggers on `push` and `pull_request` to `main` and `phase1` branches.
- Manual trigger via `workflow_dispatch`.

### Pipeline Jobs
1. **Lint & Unit Tests**:
   - Runs on `ubuntu-latest` with Node.js 22.
   - Installs clean dependencies with `npm ci`.
   - Runs syntax linter (`npm run lint`).
   - Runs automated unit & data integrity tests (`npm run test:unit`).
2. **Docker Build & Smoke Verification**:
   - Runs after tests pass.
   - Validates `docker-compose.yml` with `docker compose config`.
   - Builds the production multi-stage Docker image with GitHub Actions layer caching.
   - Spins up a test container and executes an HTTP smoke test against `/health`.
   - Validates the multi-stage `test` target.

---

## 9. Production Deployment Best Practices

When deploying to production (VPS, Kubernetes, AWS ECS, GCP Cloud Run, Render):

1. **Secrets Management**:
   Never commit `.env` into git. Inject `GEMINI_API_KEY` and database credentials via your hosting platform's secrets manager (e.g. GitHub Secrets, AWS Secrets Manager, GCP Secret Manager).
2. **Reverse Proxy & SSL**:
   Place an SSL-terminating reverse proxy (Nginx, Traefik, or Caddy) in front of the application container to handle HTTPS and WebSockets.
3. **Database Backups**:
   Schedule automated backups of the `gemini-live-pgdata` volume or use a managed database instance (AWS RDS, Supabase, Neon, GCP Cloud SQL).
4. **Resource Limits**:
   Define container memory and CPU limits in production compose or orchestrator configs (e.g. `memory: 512M`, `cpus: 1.0`).
5. **Non-Root Execution**:
   The production Dockerfile adheres to security standards by switching to `USER node` before exposing ports and running the process.
