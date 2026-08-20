# AGENTS.md

## Scope

These instructions apply to the whole Pen monorepo and are written for AI coding agents (Cursor agents and Agent mode in the Cursor IDE). Human contributors follow the same conventions where noted.

Pen is a headless, extension-first, block-native rich text editor SDK built on a Yjs CRDT document, with first-class AI co-authoring. It is source-available under a commercial license (`LICENSE.md`) — do not describe it as open source.

## Architecture

The monorepo is layered; dependencies point strictly downward:

- `packages/types` (`@input/pen-types`) — shared contracts: types, constants, guards. Target state is types-only (see `spec-v2/14-api-and-packaging.md` API3); today it still carries schema builders and the registry.
- `packages/crdt/yjs` (`@input/pen-crdt-yjs`) — the Yjs adapter: document shape (`blockOrder`, `blocks`, `apps`, `metadata`), transactions, update handling, undo integration.
- `packages/core` (`@input/pen-core`) — the editor runtime: `editor.apply(ops, options)` pipeline, validation, normalization, selection, extension manager, events. Runtime authority for everything.
- `packages/schema/default` — the default block/inline schema set.
- `packages/rendering/dom` (`@input/pen-dom`) — the framework-free DOM engine: field editors (EditContext + contenteditable backends), selection bridge, key handling, clipboard/transfer, reconciliation, overlays. The hardest code in the repo lives here.
- `packages/rendering/react` / `packages/rendering/vue` — thin framework bindings over pen-dom. Behavior belongs in pen-dom or core, never here.
- `packages/extensions/*` — undo, history, search, input-rules, shortcuts, multiplayer, import/export (html, markdown, json, xml), document-ops, and the AI family (ai, ai-suggestions, ai-autocomplete, ai-skills, ai-tools, delta-stream).
- `packages/presets/default` — batteries-included assembly of core + default schema + recommended extensions.
- `packages/shared/*`, `packages/transports/*` (direct, sse), `packages/tooling/*` (test, bench, assets-memory), `packages/docs`, `playground/`.

## Specs Are The Contract

Pen has no separate contracts directory; the spec set is the source of truth:

- `spec/` describes the workspace as currently shipped (package-centric, current-state).
- `spec-v2/` is the approved v2 design and audit record: selection engine, change summaries, facets, commands, commit pipeline, DOM scheduling, bidi, security, accessibility, API/packaging, and the migration wave plan.

Rules for agents:

- Before touching selection, input handling, the apply pipeline, extension wiring, rendering security, or packaging, read the matching `spec-v2/` document first. Normative rules carry stable IDs (`A1`–`A6`, `S1`–`S6`, `SEC1`–`SEC8`, `AX1`–`AX8`, `API1`–`API9`, ...); cite them in PR descriptions and test names.
- When implementation work proves a spec rule wrong or untestable, amend the spec in the same PR. Silent divergence between code and spec is not acceptable (`spec-v2/10-migration-waves.md`, Working Agreements).
- `spec/` gets updated when shipped behavior changes; `spec-v2/` gets updated when design decisions change.

## Core Principles

- `DocumentOp[]` is the mutation currency; `editor.apply(ops, { origin })` is the only durable write path. Never write `Y.Text`/`Y.Map` directly or call `adapter.transact` outside core (the delta-stream exception is being removed by `spec-v2/06-commit-pipeline.md`).
- Set operation origins intentionally (`user`, `ai`, `collaborator`, `input-rule`, structured origins with `groupId`/`requestId`); undo, suggestions, and diagnostics depend on them.
- Keep Pen headless: core and extensions must work without a DOM (`createHeadlessEditor`). Only `@input/pen-dom` may touch browser globals.
- Prefer non-fatal behavior in runtime paths: drop invalid input with a `diagnostic` event rather than throwing from hooks, observers, or extension code.
- Normalization is incremental and idempotent; repeated passes must not produce new changes.
- The `\u200B` empty-block sentinel is an implementation detail; do not add new code that tests for it (see `spec-v2/03-selection.md` §2 for the two sanctioned seams).
- Selection code is under redesign; do not add `requestAnimationFrame`/`setTimeout` retries, suppression flags, or intent counters to selection paths (`spec-v2/03-selection.md` S4). If a selection bug cannot be fixed without one, stop and surface it.
- Follow `.cursor/rules/*.mdc` for import style (extensionless), extension resilience, and headless React primitive conventions.

## Commands

From the repository root (pnpm + turbo):

- `pnpm build` / `pnpm typecheck` / `pnpm test` — all workspaces via turbo.
- `pnpm --filter @input/pen-core test` (or any package name) — scoped runs; prefer these while iterating.
- `pnpm test:e2e` — Playwright suite.
- `pnpm lint` — Prettier format check plus turbo lint.
- `pnpm changeset` — required for any change to a published package (see Releases).

For substantive changes run `pnpm build`, `pnpm typecheck`, and `pnpm test` before finishing (`.cursor/rules/pen-security-quality-gates.mdc`). Scale scope to the change: a one-package fix needs that package's checks plus its dependents' tests, not the world.

## Testing Guidance

- Vitest, `.test.ts`, colocated per package (`src/__tests__/` or alongside sources — match the package you are in).
- Test headlessly by default: core logic, ops, schema, extension behavior, and anything expressible without a DOM. jsdom cannot represent real selection, IME, or geometry — do not write jsdom tests that pretend to cover those; that is what the conformance package (`spec-v2/09-reliability-testing.md`) is for.
- Perf-sensitive paths have benchmark expectations in `packages/tooling/bench`; do not regress them.
- Deterministic fixtures live in `packages/tooling/test`; reuse them instead of hand-rolling documents.

## Git Conventions

- Local agents: never create or switch branches; stay on the user's checkout.
- Commit messages: imperative sentence naming the component and objective, matching repo history (`Refactor editor extension handling and improve test structure`, `Enhance inline atom handling and DOM reconciliation`). No conventional-commit prefixes.
- Only commit when explicitly asked.

## Releases

- Changesets drive versioning (`pnpm changeset`, `pnpm version-packages`, `pnpm release`). Any PR that changes a published package's behavior or API includes a changeset.
- Published packages ship dual ESM/CJS with `exports` maps, `files`, and `sideEffects: false`; keep manifests consistent (`sync-package-metadata.mjs` exists for shared fields).

## Agent Skills And Reviewers

- `.agents/skills/pen-deslop` — audit for AI-generated slop patterns specific to this codebase.
- `.agents/skills/ligne-blanche` — boundary/structural integrity review for changes.
- `.cursor/skills/investigate` — root-cause investigation workflow; use before fixing non-trivial bugs.
- `.cursor/agents/spec-reviewer.md` — reviews a diff against `spec/`, `spec-v2/` rule IDs, and `.cursor/rules`; use proactively after implementing features or refactors.
