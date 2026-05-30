# UI Example: Button Boundary

A button is a visual component. It should not know what business action it
triggers.

Good:

```tsx
<Button variant="primary" onClick={onCreateProject}>
  Create project
</Button>
```

Avoid:

```tsx
<CreateProjectButton />
```

if `CreateProjectButton` owns API calls, permissions, navigation, toasts, data
refreshes, or project creation logic.

## Preferred Shape

```text
packages/ui/Button
  visual styles
  variants
  accessibility states
  typed click callback

apps/web/features/projects/create-project
  controller or view model
  form state
  user interaction flow
  calls server action

packages/core/projects
  application service
  permission checks
  validation orchestration
  domain behavior
```

The same visual component can create a project, create an article, or confirm a
delete action because the command is not inside the component.
