# Wave 1: One Channel

Depends on: wave 0. Blocks: wave 2.
Packages touched: `@input/pen-ai`, `packages/presets/default`, `playground/`, `examples/`, `packages/docs`. `@input/pen-document-ops` is read-only this wave (its tools do not change; only what mounts them does, in wave 3).

Discharges UC1 and UC2; starts UC9 (the release completes in wave 3). The XML edit channel — parser, closing pass, `text-fast-apply`, `markdown-full-replace`, the plain-markdown fallback, the `editChannel` option, and the `AIEditChannel` vocabulary — is deleted, and every consumer in the repo moves to the tool channel in the same wave. Deliberately out of scope: the `markdown-fast-apply` plan helpers that the generate-lane buffered preview still consumes survive until wave 2 migrates that preview; deleting them here would entangle the channel teardown with the presentation migration (WA11: one subtraction at a time).

Order of PRs inside the wave (WA11): consumers flip first (presets, playground, examples, docs default to the tool channel and stop passing `editChannel`), deletions second, claiming tests land with the deletions.

## Entry Gate

- GATE 1.1 [script]: `node -e "process.exit(require('fs').existsSync('spec-v5/evidence/baseline.md')?0:1)"`
  expect: exit 0 — the baseline exists; regressions in this wave are measurable against it.
- GATE 1.2 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — the corpus net is green before the teardown begins.

## 1. Consumers Flip

Presets, playground, examples, and docs construct the AI extension without an `editChannel` argument and exercise the tool channel. Docs pages that describe the XML channel are rewritten or deleted in the same PR (no "legacy" appendix — WA9).

- GATE 1.3 [grep]: `rg -n "editChannel" playground/src packages/presets examples packages/docs/src`
  expect: exit 1 — no host in the repo selects a channel; there is nothing to select.

## 2. The Deletions

Delete from `@input/pen-ai`: the `<pen-fast-apply>` stream parser and its closing pass; the `text-fast-apply` and `markdown-full-replace` strategy implementations; the plain-markdown fallback that could answer a parse failure with an unasked-for full replace; the `editChannel` option plumbing in `extension.ts`; `AI_EDIT_CHANNELS`/`AIEditChannel` in `runtime/contracts.ts`; the prompt scaffolding that taught the model the XML contract; and the tests that exist only to pin the deleted paths. The PR description lists every deleted file so the wave can be audited with `git log --diff-filter=D`.

- GATE 1.4 [grep]: `rg -n "pen-fast-apply" packages playground examples`
  expect: exit 1 — the XML tag token survives nowhere: no parser, no prompt, no test, no doc.
- GATE 1.5 [grep]: `rg -n "AI_EDIT_CHANNELS|AIEditChannel" packages`
  expect: exit 1 — the channel vocabulary is gone from source, types, and reports.
- GATE 1.6 [grep]: `rg -n "text-fast-apply|markdown-full-replace" packages --type ts`
  expect: exit 1 — the XML-channel strategies are deleted, not disabled.

## 3. The Claims

- GATE 1.7 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc1.channel.test.ts`
  expect: exit 0 — UC1 claimed: the extension exposes no channel option and mounts the tool channel unconditionally.
- GATE 1.8 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc2.noTextMutation.test.ts`
  expect: exit 0 — UC2 claimed: a malformed edit payload leaves the document hash unchanged and emits a diagnostic; no code path turns assistant text into ops.

## Exit Gate

- GATE 1.9 [test]: `pnpm --filter @input/pen-ai test && pnpm --filter @input/pen-document-ops test`
  expect: exit 0 — full suites green after the teardown.
- GATE 1.10 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — corpus results hold against the wave-0 baseline; the teardown deleted a loser, not capability.
- GATE 1.11 [script]: `node -e "const fs=require('fs');const p='packages/extensions/ai/api-report.md';process.exit(fs.existsSync(p)&&!/AIEditChannel/.test(fs.readFileSync(p,'utf8'))?0:1)"`
  expect: exit 0 — the public API report is regenerated in the same wave and no longer admits the channel vocabulary (HB7 posture, early).
