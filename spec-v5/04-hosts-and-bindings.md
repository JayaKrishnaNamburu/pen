# v5 Hosts and Bindings: A Declared Story (HB)

Status: adopted 2026-08-26. `HB` rules are normative. They govern the surfaces through which Pen reaches applications: the React and Vue bindings, the vanilla/DOM path, the headless path, `packages/presets/default`, `examples/*`, `packages/docs`, the playground, and the transports. The premise (`00-concept.md` §3): the 9.7× size spread between the React binding (19,727 lines) and the Vue binding (2,037 lines) is not itself a defect — React carries headless primitives and the reference feature set — but the absence of any document saying *which* differences are intended is how parity gaps ship silently.

## 1. The Contract

- HB1. **The capability matrix is normative.** One document (`packages/docs`, mirrored in each binding README) states per surface — React, Vue, vanilla DOM, headless — the status of each capability: fields, expanded fields, table-cell editing, AI review UI, streaming preview, autocomplete, overlays, interop, multiplayer. Each cell is `supported`, `not-supported`, or `planned`, and `supported` means demonstrated by a running example or playground path plus tests. A capability absent from the matrix does not exist publicly; changing a cell is a spec-visible change reviewed like one. The matrix replaces line-count comparisons as the parity instrument: Vue reaching React is not a goal; Vue's column being honest is.
- HB2. **Bindings stay thin, as a standing rule.** Behavior belongs in `@input/pen-dom`, core, or extensions; bindings provide subscriptions, components, and framework glue only. v4 CS8 executed the first tranche (gestures and atom interactions moved below; feature deps became optional peers); HB2 makes the direction standing: new binding code that could live below the binding must, and a binding PR adding non-glue logic needs the matrix to say why. The react binding's remaining bulk is re-measured after Waves 1–3 delete the AI surface it mirrors.
- HB3. **Examples and docs build under CI.** `examples/react`, `examples/vue`, `examples/vanilla`, and `packages/docs` are in the turbo build graph with `build` (and `typecheck` where configured) running in CI; their `dist/` outputs are gitignored. An example that stops compiling fails a PR, not a user following the README. At adoption, example and docs `dist/` outputs sit untracked in working trees — the gitignore entry is part of the same change.
- HB4. **Presets declare their batteries.** `packages/presets/default` states in its README exactly which extensions, schema set, and configuration it assembles, and tracks the capability matrix. A consumer can diff what the preset gave them against what the matrix offers. When a wave deletes an option (UC1's `editChannel`), the preset's declaration updates in the same PR — a preset that silently re-defaults is how removed knobs come back.
- HB5. **Every supported capability is demonstrated outside the playground.** The playground is the reference host, not the proof: each `supported` cell in the matrix is exercised by at least one example app or docs demo for that surface. This is the anti-"playground-only wiring" rule — the class of gap where a feature works in the one host its author ran.

## 2. The Edges

- HB6. **Transports state their tier and keep a consumer.** `transports/direct` and `transports/sse` each document their support status (reference, supported, experimental) and are covered by at least one integration test driven from a host path. A transport that loses its last consumer is deleted under the inventory rule (WA9), not kept as a maybe.
- HB7. **Barrels export the documented API and nothing else.** Public barrels (`index.ts` per package) list only what the docs and matrix admit; the `@input/pen-ai` barrel drops planner, strategy, and channel exports with UC1/UC3, and every barrel change regenerates its `api-report.md` in the same PR. The api-report diff is the reviewable artifact — an export that appears in the report without a matrix or docs home is the defect this rule exists to catch.

## 3. Testing Contract

- HB1: a matrix-conformance check — a script walks the matrix document and asserts every `supported` cell names its demonstrating example/test path, and every named path exists.
- HB2: review-enforced via the matrix requirement; the CS8 boundary tests (gestures/atoms living in pen-dom) keep claiming their v4 rules.
- HB3: CI wiring itself — turbo graph includes the example/docs builds; the gitignore entry lands with it (grep gate: `git status --short` in CI shows no `dist/` untracked after builds).
- HB4: preset declaration test — construct the preset and assert its assembled extension list equals the declared list.
- HB5: covered by HB1's check (each supported cell names a non-playground demonstration).
- HB6: one integration test per transport, named for HB6.
- HB7: api-report regeneration enforced by the existing report check; a barrel test asserting removed symbols (planner, strategies, `editChannel`) are absent after Wave 3.
