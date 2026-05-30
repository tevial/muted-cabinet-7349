# Quality Gates

Quality gates define when work is ready to start, ready to merge, and ready to
release.

## Definition Of Ready

Before implementation starts:

- Project kickoff path is selected: Recommended or Enterprise.
- Product brief exists.
- Core workflows are documented.
- Domain terms are captured in the glossary.
- Production stack and local parity plan are documented.
- Major architecture decisions have ADRs or open questions.
- Owning module is identified.
- Reuse candidates have been checked.

## Definition Of Done

Before a change is complete:

- Module boundaries are respected.
- Duplicate logic was reused, parameterized, or consolidated.
- UI components are presentation-only.
- Relevant catalogs are updated.
- Docs are updated when contracts, workflows, or public APIs changed.
- The smallest meaningful verification was run.
- Any unverified areas or residual risks are stated clearly.

## Architecture Violation Examples

- UI imports the data layer.
- Shared UI imports feature controllers.
- API and tool adapters duplicate the same business operation.
- Local database differs from production database technology.
- A hook is copied for each UI surface instead of parameterized.
- A new module has no catalog entry.
