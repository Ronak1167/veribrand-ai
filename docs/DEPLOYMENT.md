# VeriBrand AI — Deployment & Operations Guide

## Current verified deployment model

The application currently uses **SQLite (node:sqlite / DatabaseSync) as its only runtime database**. The PostgreSQL schema, adapter, migration runner and transfer scripts are experimental tooling; API repositories have not been ported to PostgreSQL. The application does not read PostgreSQL for normal requests. Do not configure managed PostgreSQL as the app's primary database until that migration is complete and all workflows are parity-tested.

The supported single-instance deployment uses Docker Compose with the Next.js web app on port 3000, the Python verification/image-analysis service on the internal Docker network, and persistent host directory ./data mounted at /app/data for SQLite and evidence files. PostgreSQL is an optional maintenance profile, disabled by default, and is not required by the app.

## Requirements

- Docker Engine 24+ and Docker Compose v2.
- Persistent, backed-up storage for ./data.
- A unique bootstrap token of at least 32 characters.
- A unique Python service API key of at least 32 characters.

## First-time setup

1. Clone the repository and enter its directory.
2. Copy .env.example to .env (Compose reads .env for variable substitution).
3. Set VERIBRAND_BOOTSTRAP_TOKEN and VERIBRAND_PYTHON_API_KEY to independently generated random secrets. Never commit .env.
4. Start the application with docker compose up -d --build, then check docker compose ps and GET http://localhost:3000/api/health.
5. Open http://localhost:3000, complete initial administrator setup with the bootstrap token, and store the admin credentials securely. The bootstrap route refuses setup after a user exists.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| VERIBRAND_BOOTSTRAP_TOKEN | One-time first-admin setup secret; required only before initial setup. |
| VERIBRAND_PYTHON_API_KEY | Shared secret authenticating web-to-Python service calls. |
| PYTHON_ENGINE_URL | Internal Python service URL; Compose sets http://python-verifier:8000. |
| VERIBRAND_DB_PATH | Optional absolute SQLite file path override; default is data/veribrand.db. |
| NODE_ENV | Set to production in Compose. |
| PORT / HOSTNAME | Web server bind configuration. |

The app health endpoint returns runtimeDatabase: sqlite; a healthy PostgreSQL container does not imply that application data is stored in PostgreSQL.

## Persistence and backup

- Persist the complete ./data directory, not just veribrand.db. Evidence uploads are stored alongside the database.
- Stop the web service before running the consistent file-copy backup. From the repository root: docker compose stop web; node scripts/backup-sqlite.mjs --app-stopped --output <backup-directory>; docker compose start web. The script checkpoints WAL, checks SQLite integrity, copies the complete data directory (database plus evidence/assets), and writes a SHA-256 manifest.
- To restore, stop the web service and run node scripts/restore-sqlite.mjs <backup-directory> --app-stopped --confirm, then start the web service. Restore verifies every file hash, database integrity and foreign keys, stages the replacement, and retains a pre-restore safety copy.
- Encrypt backups at rest, restrict access, retain off-host copies, and periodically restore into an isolated environment. Never copy only the main database file while WAL writes are active.
- PostgreSQL backup/restore scripts apply only to the optional PostgreSQL tooling profile. They do not back up the app's active SQLite database.

## Optional PostgreSQL maintenance profile

Only enable this profile when intentionally testing PostgreSQL migrations or maintenance scripts. Supply a unique POSTGRES_PASSWORD in .env first, then run docker compose --profile postgres-tools up -d postgres. The PostgreSQL port is bound to localhost only (127.0.0.1:5433). Do not expose it publicly. The app does not depend on this service.

## Health and operational checks

- GET /api/health reports application status, active runtime database, and Python service status.
- The Python health endpoint is internal to the Docker network and is not published on the host by default.
- Use docker compose ps to check container health and docker compose logs --tail=200 web python-verifier to inspect service logs.

A healthy endpoint is a liveness/readiness signal, not a security certification or proof of disaster-recovery readiness.

## Production constraints and go-live checklist

This deployment model is single-instance only. Before exposing it to real users or deploying multiple replicas, complete and verify PostgreSQL runtime migration across every repository/API path (or retain one durable SQLite instance with a documented concurrency/backup model), distributed rate limiting and session/security controls appropriate to the topology, TLS/domain/cookie configuration, secret management, monitoring and alerting, restore drills for database and evidence files, authenticated end-to-end tests for every role and tenant, and independent security/accessibility review. A real production hosting target and credentials are also required; local Docker health is not a production deployment.

Do not claim production readiness until applicable checks have been completed against the actual target environment.
