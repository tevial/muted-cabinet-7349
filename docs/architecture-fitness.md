# Architecture Fitness Checks

Architecture rules should be checkable. Start with human review. Later, enforce
the same rules with lint, dependency, or CI checks.

## Required Checks

- Apps may depend on packages.
- Packages must not depend on apps.
- `packages/contracts` must not depend on product packages.
- `packages/ui` must not depend on core, database, app code, server actions, or
  tool adapters.
- Other modules may import public package exports only.
- Do not import from another package's `src/internal`.
- Presentational components render props and emit typed events.
- Local development must follow [Production Parity](production-parity.md).

## Suggested Enforcement

Future implementation should add checks such as:

```text
eslint no-restricted-imports
TypeScript project references
pnpm package boundary scripts
dependency-cruiser or equivalent
CI architecture check
```

## Human Review Checklist

- Does this change introduce a new dependency direction?
- Does this module import from another module's internals?
- Did UI remain presentation-only?
- Did reusable logic stay in a single owner?
- Did new runtime/database choices preserve production parity?
- Did new public surfaces update the catalogs?
