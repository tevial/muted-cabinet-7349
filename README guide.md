# Architecture Guide

This repository includes a Codex-friendly architecture guide under `docs/`.

Start here:

1. `AGENTS.md` - operating contract for coding agents.
2. `docs/product/README.md` - product-specific context.
3. `docs/module-boundaries.md` - module ownership and dependency direction.
4. `docs/ui-architecture.md` - controller/view/component boundaries.
5. `docs/catalog/modules.md` - current module catalog.
6. `docs/catalog/ui-components.md` - current UI catalog.

When adding a feature, identify the owning module first, update the relevant
catalog entry, and keep durable logic out of presentational UI.
