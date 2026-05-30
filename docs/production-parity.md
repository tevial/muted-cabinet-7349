# Production Parity

Local development must be shaped by the intended production stack.

Do not build a convenient local-only architecture that must be redesigned when
the project is deployed. The local version should use the same architectural
assumptions, schema model, runtime constraints, environment boundaries, and
deployment targets planned for production.

## Core Rule

Production is the source of architectural truth. Local development adapts to
production, not the other way around.

If production will use Cloudflare Workers, local development should use Wrangler,
Miniflare, workerd-compatible APIs, and Cloudflare-style bindings from the
beginning.

If production will use Supabase Postgres/Auth/Storage, local development should
use Supabase CLI, Supabase migrations, and a schema compatible with the remote
Supabase project from the beginning.

## Required Environment Model

Every project should define:

```text
local
preview/staging
production
```

Rules:

- The same code path should run in every environment whenever practical.
- Differences should be configuration, not architecture.
- Environment variables must be validated and documented.
- Production-only limitations must be known during local development.
- Preview/staging must not accidentally use production data or production
  bindings.

## Database Rule

The local database must match the production database technology and schema
strategy.

For Supabase:

- Use Supabase CLI for local development.
- Use migrations as the source of truth for schema changes.
- Test migrations locally before pushing them to remote projects.
- Keep generated schema/types compatible with Supabase Postgres.
- Do not design around SQLite or an in-memory database if production is
  Supabase Postgres.
- Do not make database assumptions locally that Supabase Postgres cannot support.

## Runtime Rule

The local runtime must match production constraints as closely as practical.

For Cloudflare:

- Use `wrangler dev` or the Cloudflare Vite plugin for Workers-compatible local
  development.
- Treat Worker runtime APIs, bindings, CPU/runtime limits, and module format as
  production constraints from day one.
- Use Cloudflare binding shapes locally instead of replacing them with unrelated
  local abstractions.
- Use remote development only for platform behaviors that cannot be simulated
  locally.

## Configuration Rule

Configuration should be environment-specific, but structure should be shared.

Good:

```text
same app
same service boundaries
same database schema
same bindings API
different environment variables
different resource IDs
different secrets
```

Avoid:

```text
local app uses Express
production app uses Workers

local database uses SQLite
production database uses Supabase Postgres

local auth is mocked differently
production auth uses Supabase Auth
```

Mocks are allowed only at explicit test boundaries. They must not become the
default application architecture.

## Architecture Kickoff Requirement

During project kickoff, record:

- Target production hosting.
- Target production runtime.
- Target database and migration strategy.
- Target auth provider.
- Target storage provider.
- Preview/staging strategy.
- Local development commands.
- Known parity gaps and how they will be tested.

Add ADRs for stack choices that affect local/production parity.

## Review Checklist

Before accepting a local implementation:

- Does it use the same runtime model as production?
- Does it use the same database technology and migration path?
- Does it use the same auth/storage assumptions?
- Are environment variables split by local, preview/staging, and production?
- Are preview/staging resources isolated from production resources?
- Is every intentional parity gap documented?
- Can deployment happen without redesigning database, backend, or module
  boundaries?
