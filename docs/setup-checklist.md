# Project Setup Checklist

Use this checklist when setting up or auditing the project architecture.

## Template Setup

- Create or update the project README.
- Confirm `AGENTS.md` points to product context.
- Review `docs/README.md`.

## Kickoff Setup

- Follow [Project Kickoff Workflow](project-kickoff.md).
- Classify the project as Recommended or Enterprise.
- Fill required `docs/product/` files for the chosen path.
- Record assumptions in `docs/product/open-questions.md`.
- Create ADRs for hard-to-reverse decisions.

## Production Parity Setup

- Fill `docs/product/environments.md`.
- Confirm local development matches the intended production runtime.
- Confirm local database matches the intended production database.
- Confirm auth and storage assumptions match production.
- Document any parity gaps and how they will be tested.

## Ready To Code

Do not begin implementation until:

- Product brief exists.
- Domain concepts are named.
- Core workflows are documented.
- Production stack is identified.
- Local environment plan matches production stack.
- Initial module boundaries are clear.
- Open questions are visible.
