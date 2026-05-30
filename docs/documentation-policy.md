# Documentation Policy

Documentation is part of the architecture. When a module, component, feature
view, workflow, tool, service, exporter, integration, or public utility is added
or changed, update relevant docs in the same change.

## Documentation Layers

```text
AGENTS.md
  mandatory agent rules

docs/
  architecture, policy, examples, and catalogs

docs/catalog/
  short agent-readable indexes

local README.md
  orientation for meaningful module boundaries

Storybook MDX or stories
  shared UI component usage

TSDoc
  reusable public TypeScript APIs
```

## Catalog Minimum

Every catalog entry should briefly include:

- Name.
- Type or layer.
- Purpose.
- Location.
- Public API or props.
- Where it is used.
- How to use it.
- What not to put inside it.
- Related docs or examples.

## Checklist

- Did I add a new public module, component, service, workflow, or tool?
- Did I update the relevant catalog entry?
- Did I document where it is used?
- Did I document how to use it?
- Did I avoid duplicating detailed docs in multiple places?
