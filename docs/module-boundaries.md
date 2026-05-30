# Module Boundaries

Start modular. Every durable feature must have one owning module and a clear
public API.

## Core Rule

Other modules may import public exports only. Do not reach into private
internals.

Good:

```ts
import { doThing } from "@project/some-module";
```

Avoid:

```ts
import { helper } from "@project/some-module/src/internal/helper";
```

## Recommended Shape

```text
apps/
  web/
  api/
  cli/
packages/
  contracts/
  core/
  workflow/
  content-engine/
  exporters/
  integrations/
  agents/
  db/
  ui/
  config/
```

Adapt the package list to the project, but keep ownership explicit.

## State Ownership

- Canonical durable state belongs on the server.
- Domain transitions belong in domain/workflow modules.
- Orchestration belongs in application services or feature controllers.
- Presentational UI receives props and emits typed events.
- Shared UI never owns business state.

## Adding A Feature

1. Identify the owning module.
2. Add or reuse contracts.
3. Add domain/workflow rules if state changes.
4. Add service operations.
5. Add persistence through the data layer.
6. Add API/tool/UI adapters as thin shells.
7. Add presentational UI separately from orchestration.
8. Update `docs/catalog/`.

## Review Checklist

- Does this code have one clear owning module?
- Is another module reaching into private internals?
- Is repeated logic parameterized with a typed scope/config instead of copied per
  surface?
- Does UI code only render state and emit events?
- Can this module be moved, replaced, or tested without sweeping the repo?
