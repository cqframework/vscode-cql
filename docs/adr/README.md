# Architecture Decision Records

This folder records the significant design decisions for the vscode-cql extension: what was
decided, why, and what was rejected.

## Conventions

- One decision per file, named `NNNN-kebab-case-title.md` and numbered in order.
- YAML frontmatter with `title`, `status`, `date` and `tags`, and optionally `issues`.
- Status is `Proposed`, `Accepted`, `Deprecated` or `Superseded by ADR-NNNN`.
- Sections: Context, Decision, Alternatives Considered, Consequences, Agent Directives.
- Accepted ADRs aren't rewritten. To change a decision, write a new ADR that supersedes it, and
  update the old one's status.
- Decisions that span repositories live in the repository that owns the behaviour. The others
  link to it.

## Related decisions in other repositories

| Repository | ADR | Why it matters to vscode-cql |
| --- | --- | --- |
| cql-language-server | [ADR-0001: Runtime network access](https://github.com/cqframework/cql-language-server/blob/master/docs/adr/0001-runtime-network-access.md) | §2.5 "Client contract": what the extension must pass to the LS JVM (VS Code `http.proxy` → JVM proxy properties, the FHIR settings path, a JVM options passthrough). Field reports: #94, #106. |
| cql-mcp | [ADR-0001: Runtime dependency resolution](https://github.com/cqframework/cql-mcp/blob/main/docs/adr/0001-runtime-dependency-resolution.md) | How a standalone client finds the LS jar on restricted networks (`settings.xml` mirrors, no `~/.m2` lookup). This is a reference design for #94. |

## Index

| ADR | Title | Status |
| --- | --- | --- |
| — | No ADRs yet | — |
