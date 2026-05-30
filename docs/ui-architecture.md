# UI Architecture

UI components must stay presentation-focused. Business logic, workflow rules,
server state orchestration, and cross-component state updates belong outside
presentational components.

## Layer Model

```text
Route / Page
  -> Feature Controller / View Model
  -> Presentational Components
  -> UI Primitives

Feature Controller
  -> Server Action or API Client
  -> Application Service
  -> Domain Modules
```

Components render state from props and emit typed events. Controllers decide what
those events mean.

## Presentational Components May

- Render props.
- Emit typed callbacks.
- Manage tiny UI-only state, such as open/closed popovers.
- Compose other presentational components.
- Use styling, layout, accessibility attributes, and icons.

## Presentational Components Must Not

- Call database queries.
- Call application services directly.
- Call external tools directly.
- Own workflow transitions.
- Duplicate permission checks.
- Mutate global state directly.
- Fetch project data unless they are route-level server components.

## Reuse Rule

Before creating any interface, page, block, feature view, or component:

1. Check shared UI.
2. Check relevant feature components.
3. Reuse existing components.
4. Compose existing components.
5. Extend props carefully.
6. Create a new component only when needed.

## Examples

- [UI Button Boundary](examples/ui-button-boundary.md)
