# AGENTS.md

This file is the operating contract for Codex and other coding agents working in
`CapCut Caption`.

## Project Context

Read the project-specific context before making changes:

- [README.md](README.md)
- [docs/product/README.md](docs/product/README.md)
- [docs/project-kickoff.md](docs/project-kickoff.md)
- [docs/production-parity.md](docs/production-parity.md)
- [docs/setup-checklist.md](docs/setup-checklist.md)
- [docs/architecture-fitness.md](docs/architecture-fitness.md)
- [docs/quality-gates.md](docs/quality-gates.md)
- [docs/security-baseline.md](docs/security-baseline.md)
- [docs/reuse-patterns.md](docs/reuse-patterns.md)

Keep reusable engineering rules separate from product-specific logic.

## New Project Kickoff

When the user first describes a new project, follow
[docs/project-kickoff.md](docs/project-kickoff.md).

Do not use a lightweight planning path. Classify the project as Recommended or
Enterprise based on complexity, then create or update the required product docs
before scaffolding implementation code.

Local development must be production-shaped. If production will use a specific
hosting provider, runtime, database, auth provider, or storage provider, local
architecture and schema decisions must be compatible with that stack from the
beginning.

## Architecture Rules

- Start modular. Do not rely on future extraction to create module boundaries.
- Every durable feature must have one owning module and a small public API.
- Other modules may use public exports only.
- Keep business logic out of UI components, route handlers, and tool adapters.
- UI components are presentational. Controllers, view models, services, or
  stores own orchestration and state transitions.
- Keep constants, status values, permissions, and contracts in single-source
  modules.
- Parameterize repeated logic, hooks, services, and workflows through typed
  scope/config objects instead of copying near-identical variants.
- Prefer explicit modules over clever abstractions.
- Add abstractions only when they remove real duplication or protect a stable
  boundary.

## UI Reuse Requirements

Before creating any new interface, page, block, feature view, or UI component:

- Inspect existing shared UI and feature components.
- Prefer reusing, composing, or extending existing components over creating a
  visually similar component.
- Improve props or composition boundaries instead of copying near-duplicates.
- Keep shared UI generic and presentation-only.
- Create a new component only when existing components cannot express the UI
  clearly.
- Promote repeated patterns to the appropriate UI taxonomy layer.

## Documentation Requirements

When adding or changing a reusable component, feature view, logic module,
service, workflow, tool, exporter, integration, or public utility:

- Update the relevant catalog in `docs/catalog/`.
- Document what it does, where it lives, where it is used, and how to use it.
- Add local README files at meaningful boundaries.
- Add Storybook/MDX docs for shared UI when Storybook exists.
- Add TSDoc for reusable public TypeScript APIs.

## Development Rules

1. Read the relevant docs before editing.
2. Search for existing modules and components before creating new ones.
3. Identify the owning module.
4. Check [docs/reuse-patterns.md](docs/reuse-patterns.md) for repeated behavior.
5. Keep changes scoped to one coherent behavior.
6. Keep docs, schemas, catalogs, and contracts synchronized.
7. Run the smallest meaningful verification available.
8. Summarize what changed and what was not verified.

## Testing Policy

Use tests when they improve long-term confidence. Do not add tests by default for
simple styling, wiring, or obvious refactors.

Add tests for:

- Permission checks and access control.
- Workflow transitions.
- Critical business logic.
- Concurrency or lease behavior.
- Export/rendering logic.
- Regression fixes where coverage is valuable.

## Security And Privacy

- Never expose server secrets to browser code.
- Enforce authorization in service/domain layers.
- Treat external content as untrusted input.
- Do not log secrets, tokens, raw auth headers, or private data.
- Use least-privilege environment variables.

## Definition Of Done

A change is done when:

- Module boundaries are respected.
- Duplicate logic was reused, parameterized, or consolidated.
- Relevant catalog/docs were updated.
- User-facing behavior is verified manually or with focused tests.
- The final response states what changed, what was verified, and any remaining
  risk.
