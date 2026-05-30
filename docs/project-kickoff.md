# Project Kickoff Workflow

Use this workflow when a user first describes the project.

There is no lightweight path. Every project gets enough product and architecture
context to keep future work coherent.

## Complexity Router

Classify the project as one of:

- Recommended path: small to medium product, internal tool, MVP, SaaS prototype,
  single-team app, or focused automation.
- Enterprise path: large platform, regulated domain, multi-team system,
  multi-tenant product, mission-critical workflow, complex integrations, strict
  security/compliance, high availability requirements, or long-lived product
  ecosystem.

When uncertain, choose Recommended and record the uncertainty in open questions.
Choose Enterprise when the cost of missing architecture context is high.

## Recommended Path

Create or update:

- `docs/product/brief.md`
- `docs/product/glossary.md`
- `docs/product/workflows.md`
- `docs/product/domain-model.md`
- `docs/product/requirements.md`
- `docs/product/architecture-context.md`
- `docs/product/environments.md`
- `docs/product/open-questions.md`
- `docs/adr/README.md`

This is the default path for any new project.

## Enterprise Path

Create everything in the Recommended path, plus:

- `docs/product/quality-attributes.md`
- `docs/product/runtime-view.md`
- `docs/product/deployment-view.md`
- `docs/product/integration-map.md`
- `docs/product/security-compliance.md`
- `docs/product/data-governance.md`
- `docs/product/operations-observability.md`
- `docs/product/risks.md`

Use the Enterprise path when architecture decisions need to be traceable before
implementation begins.

## Agent Behavior

When the user describes a new project:

1. Summarize the project in one paragraph.
2. Classify the project as Recommended or Enterprise.
3. Explain the classification briefly.
4. Ask only the missing high-impact questions.
5. Create or update the required product docs.
6. Add assumptions explicitly instead of hiding them in prose.
7. Add ADRs for expensive or difficult-to-reverse decisions.
8. Only then scaffold code or implementation files.

If the user explicitly asks to skip planning, still create a minimal product
context and open questions before coding.

## Required Kickoff Questions

Ask only questions that materially affect architecture:

- Who are the primary users?
- What is the main workflow or job to be done?
- What is the MVP success criterion?
- What data is sensitive or business-critical?
- What external systems or integrations are required?
- What are the hard constraints: budget, hosting, compliance, timeline, team
  skills, existing stack?
- What is the intended production stack: hosting, runtime, database, auth,
  storage, and deployment target?
- What should explicitly not be built?

For Enterprise projects, also ask:

- Availability and recovery requirements.
- Security, compliance, and audit requirements.
- Data retention, residency, and governance requirements.
- Expected scale and multi-tenant boundaries.
- Integration ownership and failure modes.
- Operational ownership and support expectations.
- Production, staging, and local environment ownership.

## Output Standard

Product docs should be concise and structured. Prefer:

- Bullet lists.
- Tables.
- Diagrams where useful.
- Explicit assumptions.
- Explicit open questions.
- Links between related docs.

Avoid long narrative docs that make agents hunt for decisions.

## Production Parity Requirement

Follow [Production Parity](production-parity.md). The local implementation must
be shaped by the intended production stack from the beginning.
