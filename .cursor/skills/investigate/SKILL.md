---
name: investigate
description: Investigate a bug or unexpected behavior before fixing it. Use when the user asks to debug, investigate, find a root cause, understand why something broke, trace a regression, or add temporary logs to understand behavior.
---

# Investigate

Use this skill to identify the root cause of an issue before proposing a fix.

This is not a repair workflow. Do not patch behavior until the investigation report explains the likely root cause and the user either asks for a fix or the next implementation step is obvious.

## First Step

Read the relevant repo entry points and rules:

- `AGENTS.md`
- `.cursor/rules/*.mdc` that match the touched area
- the matching `spec/` documents (selection bugs → `spec/rules/selection.md`, pipeline bugs → `spec/rules/pipeline.md`, and so on)

Then frame the issue:

- symptom
- expected behavior
- actual behavior
- affected environment (browser/backend: EditContext vs contenteditable, headless vs DOM)
- reproduction status
- affected packages
- user-visible impact

## Timeline

Use git history as investigation context.

Inspect recent commits touching the suspected path, especially changes to:

- the apply pipeline, op executors, normalization, selection manager, and events in `packages/core`
- the Yjs adapter: document shape, transactions, remote update handling, undo integration in `packages/crdt/yjs`
- field editors, selection bridge/projection, key handling, clipboard/transfer, reconciliation in `packages/rendering/dom`
- renderer bindings and primitives in `packages/rendering/react` / `vue`
- extension behavior: undo, input rules, AI streaming (delta-stream), suggestions, multiplayer
- schema definitions and normalization in `packages/schema`
- dependencies, build tooling, and test fixtures

Treat recent commits as leads, not proof.

Do not run `git bisect` by default. Use `git bisect` results only when a human explicitly approved running it in a clean or disposable worktree with a deterministic reproduction command.

## System Path

Map the execution path before editing.

Pen bugs usually live on one of these paths — name which one and walk it end to end:

- input: DOM event → backend (EditContext/contenteditable) → key handling / beforeinput → ops → apply pipeline → Y transaction → observers → render
- selection: DOM `selectionchange` → bridge/reader → editor selection → projection back to DOM
- remote: Yjs update → adapter events → extension observers → reconcile → selection restore
- streaming: protocol part → delta-stream target → Y.Text writes → decorations/awareness

For each relevant layer, identify: owner, input, output, boundary or contract, likely failure mode, current evidence. Check whether a `spec/rules/` rule already defines the intended behavior — a bug is often a rule violation with a name.

## Hypotheses

Write two to four hypotheses before adding logs or changing code.

For each hypothesis, include:

- why it explains the symptom
- supporting evidence
- contradicting evidence
- smallest next observation that would confirm or reject it

## Instrumentation

Only add temporary logs after the path and hypotheses are clear.

Rules:

- log at decision points and cross-boundary handoffs (op apply, Y transaction origin, selection read/write, backend events)
- use searchable labels
- keep logs minimal; prefer the editor's `diagnostic` event channel where it exists
- remove temporary logs before finishing unless the user asks to keep them

## Report

Before fixing, report:

- strongest hypothesis
- evidence gathered
- relevant commits or changed files
- mapped layers and ownership boundaries
- temporary logs added, if any
- unknowns that still matter
- next experiment or fix
- verification that would prove the fix (headless test, conformance scenario, or manual script)

## Anti-Patterns

- fixing the first plausible cause
- patching the DOM layer for a bug whose owner is core (or vice versa)
- adding a timer, retry, or suppression flag to make a race disappear (see `spec/rules/selection.md` S4)
- inspecting only the package where the symptom appears
- ignoring recent commits or local changes
- treating typecheck as behavioral proof
- adding broad logs everywhere
- saying "cannot reproduce" without the attempted path and remaining unknowns
