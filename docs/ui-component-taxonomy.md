# UI Component Taxonomy

Use atomic composition as the mental model for UI.

```text
foundations   design tokens, theme primitives, icon exports
primitives    atoms
compounds     molecules
patterns      organisms
layouts       templates
feature views feature-specific presentation
pages         routes
```

## Shared UI Structure

```text
packages/ui/
  src/
    foundations/
    primitives/
    compounds/
    patterns/
    layouts/
```

## Rules

- Primitives do not import compounds, patterns, layouts, or feature views.
- Compounds compose primitives.
- Patterns compose primitives and compounds.
- Layouts arrange regions and slots.
- Feature views live with the feature until they become reusable.
- Shared UI must not import application services, database code, or feature
  controllers.

## Promotion Rule

Promote a component to shared UI only when:

- It is reusable across features or clearly a design-system primitive.
- It has no feature-specific business logic.
- Its props describe visual state or generic interaction.
- Its dependencies are allowed for the target layer.

## Documentation Rule

When adding or changing a reusable UI component, update
`docs/catalog/ui-components.md`.
