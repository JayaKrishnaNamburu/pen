# Parallel Audit

Use this when the scope is large enough that one pass is likely to miss generated-code artifacts.

## Spawn

If a sub-agent tool is available, spawn 3 sub-agents in parallel. Use read-only/explorer agents for audits and worker agents only when assigning disjoint edits.

If no sub-agent tool is available, run the same lenses sequentially yourself and report only verified findings.

Give every sub-agent:

- the exact artifact: diff, file list, branch, module, or pasted code
- the relevant local instructions or paths to read (`AGENTS.md`, matching `spec/rules/` docs, `.cursor/rules`)
- the task: find AI-generated slop with evidence and concrete remedies
- the output shape: findings only, ordered by severity, with file/line references

Do not give sub-agents your suspected findings.

## Lenses

Use separate briefs:

1. **Local-fit lens** — compare the artifact to nearby callers, callees, sibling modules, naming, tests, and file structure.
2. **Complexity lens** — look for fake robustness, unnecessary indirection, over-general helpers, cast-heavy contracts, guard-flag accretion, and branches that can disappear.
3. **System-contract lens** — check the apply pipeline boundary, extension seams (facets/slots), offset domains, package dependency direction, and whether the change bypasses canonical layers or contradicts a `spec/rules/` rule ID.

Add a fourth lens only when the artifact needs a domain-specific pass, such as selection/projection behavior, IME/input handling, schema/normalization, or AI streaming flows.

## Merge

Treat sub-agent output as evidence, not truth. Deduplicate, verify the highest-severity claims locally, and report only findings you can defend from source context.

When editing after the audit, keep ownership narrow. Do not ask multiple workers to touch the same files unless the previous worker is done and its changes are reviewed.
