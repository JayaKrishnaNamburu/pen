# Wave 5: Hosts and Release

Depends on: waves 3 and 4. Closes release 0.6 and the v5 train.
Packages touched: `packages/docs`, `examples/`, `packages/presets/default`, `packages/transports/*`, binding READMEs/STYLING docs, `@input/pen-conformance` (cell parity), `.gitignore`, CI wiring, `scripts/` (the matrix checker).

Discharges HB1–HB7 and FE6. Everything in this wave declares truth over what survived the earlier waves: the capability matrix, the preset's battery list, transport tiers, cell parity, and the barrel/api-report final state. The react binding is re-measured after the AI teardown and the result recorded in the evidence document.

Order of PRs (WA11): the declared contracts (matrix, preset, transports, cell parity) land first — declaring may surface deletions (an undemonstrable `supported` cell, a consumerless transport), and those deletions land in this wave, before the release.

## Entry Gate

- GATE 5.1 [grep]: `rg -n "structuredPlanner|planExecutor|planValidation|pen-fast-apply" packages --type ts`
  expect: exit 1 — the AI arm's teardown held through to this wave.
- GATE 5.2 [grep]: `rg -n "requestAnimationFrame" packages/rendering/dom/src --glob "!scheduler.ts" --glob "!**/__tests__/**"`
  expect: exit 1 — the spine arm's frame authority held.

## 1. The Capability Matrix (HB1, HB5) and Cell Parity (FE6)

The matrix document states per surface (React, Vue, vanilla DOM, headless) the status of each capability; every `supported` cell names its demonstrating example or docs path and its tests. The cell-parity contract declares which field-editor capabilities apply inside table cells, with conformance coverage for the declared set and failing-closed behavior for one declared-unsupported capability.

- GATE 5.3 [script]: `node scripts/check-capability-matrix.mjs`
  expect: exit 0 — the checker (added this wave) walks the matrix; every `supported` cell names an existing demonstration path outside the playground, and every named path exists.
- GATE 5.4 [test]: `pnpm --filter @input/pen-conformance test -- scenarios/fe6-cell-parity.spec.ts`
  expect: exit 0 — FE6 claimed: declared-supported capabilities work in cells; the declared-unsupported case fails closed with a diagnostic instead of half-working.

## 2. Hosts Build Under CI (HB3)

Examples and docs join the CI build; `dist/` outputs are gitignored.

- GATE 5.5 [test]: `pnpm --dir examples/react run build && pnpm --dir examples/vue run build && pnpm --dir examples/vanilla run build && pnpm --dir packages/docs run build`
  expect: exit 0 — every example and the docs site compile from a clean tree; this command (or its turbo equivalent) runs in CI from this wave on.
- GATE 5.6 [script]: `git check-ignore examples/react/dist examples/vue/dist examples/vanilla/dist packages/docs/dist`
  expect: exit 0 — build outputs are ignored; the untracked-dist noise in working trees ends here.

## 3. Presets, Transports, Barrels (HB4, HB6, HB7)

The preset README declares its assembled extensions, schema set, and configuration; a test constructs the preset and asserts the assembly equals the declaration. Each transport documents its tier and carries one host-driven integration test, or is deleted under the inventory rule. Barrels export only what the docs and matrix admit, with api-reports regenerated.

- GATE 5.7 [test]: `pnpm --filter @input/pen-preset-default test -- src/__tests__/hb4.batteries.test.ts`
  expect: exit 0 — HB4 claimed: the constructed preset's extension list equals the declared list, so the declaration cannot drift.
- GATE 5.8 [test]: `pnpm --filter @input/pen-transport-direct test && pnpm --filter @input/pen-transport-sse test`
  expect: exit 0 — HB6 claimed: each transport passes its integration test; a transport that cannot produce one is deleted instead.
- GATE 5.9 [script]: `node -e "const fs=require('fs');const r=fs.readFileSync('packages/extensions/ai/api-report.md','utf8');process.exit(/structuredPlan|ApplyStrategy|EditChannel/.test(r)?1:0)"`
  expect: exit 0 — HB7 claimed at the barrel that mattered most: the AI package's public report admits none of the deleted vocabulary.

## 4. Re-Measure and Close

The evidence document gains a closing section: package and hotspot line counts after the train, the react binding's size after the AI teardown, the final route-vocabulary census, and the presentation inventory (three surfaces). Numbers are recorded next to their wave-0 baselines.

- GATE 5.10 [script]: `node -e "const t=require('fs').readFileSync('spec-v5/evidence/baseline.md','utf8');process.exit(t.includes('After the train')?0:1)"`
  expect: exit 0 — the closing measurements exist beside the baselines; the train's effect is a recorded fact, not a memory.

## Release 0.6

- GATE 5.11 [script]: `node -e "const fs=require('fs');const files=fs.readdirSync('.changeset').filter(f=>f.endsWith('.md')&&f!=='README.md');process.exit(files.length>0?0:1)"`
  expect: exit 0 — the coordinated 0.6 bump carries its changesets.
- GATE 5.12 [test]: `pnpm build && pnpm typecheck && pnpm test`
  expect: exit 0 — repo-wide green.
- GATE 5.13 [test]: `pnpm test:e2e`
  expect: exit 0 — the reference host works end to end at train close.
- GATE 5.14 [script]: `node scripts/coverage-rules.mjs`
  expect: exit 0 — every UC/RS/FE/HB rule is claimed or carries a dated amendment explaining why not; the v5 unclaimed report is empty at train close.
