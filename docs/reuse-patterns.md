# Reuse Patterns

DRY means one clear owner for repeated behavior, with typed parameters for
legitimate variation.

## Core Rule

If logic, a hook, a service, or a workflow is used in multiple places with small
differences, do not copy it for each place. Create a reusable layer that accepts
typed parameters and returns the right behavior or data for the caller.

Example:

```ts
type ExampleSurface =
  | "list-card"
  | "details-drawer"
  | "batch-drawer";

type ExampleSource = "primary" | "secondary";

type ExampleUiScope = {
  source: ExampleSource;
  surface: ExampleSurface;
  itemIds: string[];
  localeIds?: string[];
};
```

## Recommended Shape

```text
shared hook/service
  accepts typed scope/config
  owns common behavior
  returns data/actions to caller

UI surface
  provides scope
  renders returned state
  emits events
```

## When To Parameterize

Parameterize when:

- The same behavior appears in more than one place.
- Differences are data, labels, surface, source, permissions, or small options.
- A shared vocabulary can describe the variation clearly.
- Tests or review would be easier with one owner.

## When Not To Parameterize

Do not force one abstraction when:

- The workflows only look similar visually but have different domain meaning.
- The shared function needs many unrelated optional fields.
- The abstraction makes simple call sites harder to understand.

In that case, keep separate modules but extract the truly shared lower-level
behavior.
