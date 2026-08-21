# Playground e2e engine promotion

## 2026-08-21 12:42–12:46 UTC — Firefox re-confirm: not measurable

Attempted on HEAD `3f2ecae` after `SelectionAuthority` and synchronous `syncDomSelectionOnce`. **Do not promote Firefox from this attempt. Do not treat the Chromium miss below as a regression.** Gate left as `continue-on-error: ${{ matrix.engine == 'firefox' }}`.

Machine: 14-core Darwin. Other lanes were running `pnpm build` / `pnpm turbo run test` against the same tree. Vite e2e (`PEN_E2E=1`, `watch: null`, HMR off) and backend were started at 12:42:53 UTC against the dirty working tree (field-editor / react / extension writes in flight; freeze list is in the run table). Playground aliases `packages/**/src`, so the frozen server is source-at-start, not `dist/`.

### Verdict: not measurable

Load during the only suite that ran was already past saturation. It then climbed far past any number that can be cited as an engine result:

| When | loadavg (1 / 5 / 15) |
| ---- | -------------------- |
| build start | 12.76 / 14.46 / 20.63 |
| server freeze 12:42:49Z | 15.72 / 15.08 / 20.71 |
| Chromium confirm start | **30.29** / 18.35 / 21.78 |
| Chromium confirm end (14.1s wall) | 25.62 / 17.90 / 21.55 |
| isolated `selectAll` start | 29.25 / 18.78 / 21.84 |
| after 45s wait | 35.90 / 21.41 / 22.67 |
| after 60s more wait | **124.94** / 51.59 / 34.08 |
| stop | **158.22** / 63.91 / 38.90 |

At 12:46 a `pnpm turbo run test --filter='!@input/pen-docs' --filter='!@input/pen-vue'` storm was live (100+ vitest workers). Backend `/health` returned `000` at load 125, then `200` again at stop. Instant CPU was a mix of other-lane vitest and Cursor; this is not a quiet confirm window.

WebKit confirm, Firefox confirm, and `enginePromotionEvidence.spec.ts` (the `selectTextRange(0, 30)` → `window.getSelection()` probe) were **not run**. Running them on this load would mint another inherited count. The known projection defect is therefore **untested on this tree**, not fixed and not still-failing.

### What did run (untrusted)

Build: `pnpm build` — 40/40, 28 cached, 9.2s.

Chromium original 12, 7 workers, no `CI` retries, frozen server reused:

```bash
pnpm exec playwright test \
  playground/e2e/aiSuggestions.spec.ts \
  playground/e2e/debug-boot.spec.ts \
  playground/e2e/history.spec.ts \
  playground/e2e/inlineSession.spec.ts \
  playground/e2e/nativeSelection.spec.ts \
  playground/e2e/selectAll.spec.ts \
  playground/e2e/streaming.spec.ts \
  --project=chromium --reporter=list
```

Result: **11 passed, 1 failed, 14.1s** (`real 15.15`). Failure is `selectAll.spec.ts:12` / assertion `selectAll.spec.ts:34` — `getEditorDocumentSnapshot().selectedText` stayed `""` for the 10s poll; expected `"First\nSecond\nThird"`. Same shape as the earlier load artifact.

Isolated re-run, 1 worker, still under load 29:

```bash
pnpm exec playwright test playground/e2e/selectAll.spec.ts:12 \
  --project=chromium --reporter=list --workers=1
```

Result: **same fail, 10.5s**. Playwright also tried to spawn its own `webServer` (`EADDRINUSE` on 8787); the frozen Vite on 4173 was still the one under test. Because the isolate was not a quiet machine, this does **not** reclassify the miss as a Chromium regression. It also does **not** clear it. Next attempt must re-run Chromium on a quiet tree before anyone cites a blocking-engine regression.

Logs: `/tmp/e2e-chromium-confirm.log`, `/tmp/e2e-chromium-selectAll-isolated.log` (not copied into `artifacts/` — this fence writes only this file, `ci.yml`, and the wave note).

### Next attempt

Need a quiet machine: 1-minute loadavg well under core count, no `turbo run test` / multi-package vitest, backend `/health` staying 200. Then, in order, on a freshly started `dev:e2e` server:

```bash
pnpm exec playwright test playground/e2e/enginePromotionEvidence.spec.ts --project=firefox
pnpm exec playwright test playground/e2e/aiSuggestions.spec.ts playground/e2e/debug-boot.spec.ts playground/e2e/history.spec.ts playground/e2e/inlineSession.spec.ts playground/e2e/nativeSelection.spec.ts playground/e2e/selectAll.spec.ts playground/e2e/streaming.spec.ts --project=chromium
pnpm exec playwright test playground/e2e/aiSuggestions.spec.ts playground/e2e/debug-boot.spec.ts playground/e2e/history.spec.ts playground/e2e/inlineSession.spec.ts playground/e2e/nativeSelection.spec.ts playground/e2e/selectAll.spec.ts playground/e2e/streaming.spec.ts --project=webkit
pnpm exec playwright test playground/e2e/aiSuggestions.spec.ts playground/e2e/debug-boot.spec.ts playground/e2e/history.spec.ts playground/e2e/inlineSession.spec.ts playground/e2e/nativeSelection.spec.ts playground/e2e/selectAll.spec.ts playground/e2e/streaming.spec.ts --project=firefox
```

Promote Firefox only if the original 12 is fully green and reproducible **and** the evidence spec shows `authorityRangeProjected: true` on Firefox. Do not infer that from synchronous `syncDomSelectionOnce` or from `SelectionAuthority` landing. If `selectAll` fails again, isolate on that same quiet machine before calling it a hold or a Chromium regression.

---

Re-derived 2026-08-21 (morning confirm). Concurrent `packages/**` writes were in flight for every run. Conformance is **not** promoted from anything below.

Vite e2e server was restarted at 09:49 UTC against current source (`watch: null`, HMR off) so the 11:41 `setDOMSelection` fallback was in the bundle. Numbers are not inherited.

## Promote or hold (e2e only)

| Engine   | Confirm run (original 12) | First full matrix (dirty, 7 workers) | Recommendation |
| -------- | ------------------------- | ------------------------------------ | -------------- |
| Chromium | **12/12**                 | 11/12 (`selectAll` empty `selectedText`) | **Promote to blocking** |
| WebKit   | **11/12 + 1 skip**        | 10/12 (`history` topbar once)        | **Promote to blocking** |
| Firefox  | not 12/12                 | 11/12 (`nativeSelection`)            | **Hold** |

CI change (not made; `.github/workflows/ci.yml` is outside this fence):

```yaml
# today
continue-on-error: ${{ matrix.engine != 'chromium' }}
# after this report
continue-on-error: ${{ matrix.engine == 'firefox' }}
```

Do not flip Firefox. Do not flip conformance `continue-on-error`.

## Original 12 specs

| Spec | Chromium confirm | WebKit confirm | Firefox reproduced |
| ---- | ---------------- | -------------- | ------------------ |
| `aiSuggestions` styling | pass | pass | pass (full matrix) |
| `aiSuggestions` apply | pass | pass | pass |
| `aiSuggestions` dismiss | pass | pass | pass |
| `debug-boot` | pass | pass | pass |
| `history` same-block undo/redo | pass | pass | pass |
| `history` topbar cross-block | pass | pass (confirm); fail once under load | **fail** (authority on new block, native on old) |
| `history` keyboard cross-block | pass | pass (confirm); fail once under load | **fail** (same split as topbar) |
| `inlineSession` overlay | pass | pass | pass |
| `nativeSelection` triple-click then caret | pass | **skip** (pre-existing) | **fail** (authority 0–30, native caret 30) |
| `selectAll` cmd+a | pass (confirm); fail once under load | pass | pass |
| `selectAll` slash Table | pass | pass | pass |
| `streaming` delta-stream | pass | pass | pass |

Confirm logs: `artifacts/e2e-chromium-confirm.log` (12 passed, 12.2s), `artifacts/e2e-webkit-confirm.log` (11 passed / 1 skipped, 11.3s).

## What is not a diagnosis

Statuses that did not survive re-derivation:

- “Firefox history is green; only `nativeSelection` remains.” First full matrix had Firefox history green. Two later runs failed both cross-block history tests. Treat Firefox history as **unreliable / currently red**, not inherited green.
- “WebKit history:55 is projector lag under a dirty tree only.” Confirm run passed. Immediate post-redo snapshot still had native on the old block. The 10s poll hides a T+0 S2 miss.
- “WebKit skip means WebKit cannot project a paragraph range.” Probe shows the same authority-vs-native split as Firefox. The skip is a runtime filter, not an engine-difference proof.
- “`selectAll` is green on all three.” Chromium failed once under 7-worker load (`selectedText === ""`), then passed isolated. Classified **load artifact**, not a hold.

## Firefox `nativeSelection` — real Pen bug

Not §4.1. Not a test artifact.

Product test used the authority fallback (`usedAuthorityFallback: true`). Triple-click left a caret. Then `editor.selectTextRange(0, 30)` ran.

`artifacts/firefox-nativeSelection.json`:

- `editorSelection`: text range, anchor 0, focus 30, `isCollapsed: false`
- `activeElement` / `attachedInlineBlockId`: same block
- `native`: collapsed, offset 30, text `""`

Probe `artifacts/firefox-projection.json` (no product-test fallback, host API only):

| Step | Authority | Native |
| ---- | --------- | ------ |
| after type | caret 30 | caret 30 |
| triple-click t0 | caret 30 | caret 30 |
| triple-click t2raf | **range 0–30** | caret 30 |
| `selectTextRange(12,12)` | caret 12 | caret 30 |
| `selectTextRange(0,30)` t0 and t2raf | **range 0–30** | caret 30 |
| untrusted `addRange` | caret 12 (not accepted) | caret 30 |

Classification:

- Untrusted `addRange` did **not** write authority. That is §4.1 working. Previous agents who stopped here were looking at the wrong write.
- `editor.selectTextRange` **did** write authority. S1/S2 require the projector to write that out regardless of gesture. It did not, at t0 or after two rAFs.
- Same-block attach is already correct. This is not the missing-attach history bug.

WebKit probe (`artifacts/webkit-projection.json`) is the same table. Chromium probe projects the range at t0.

## Where the write dies (report only)

Do not patch these from this fence. Another agent owns the projector.

1. `packages/rendering/dom/src/field-editor/selectionBridgeOffsets.ts` **237–308** (`setDOMSelection`). In-flight fallback (HEAD `f707e9c`, 11:41) still leaves Firefox/WebKit at the old caret. `setBaseAndExtent` is trusted when the write is collapsed (`!intendedRange`); a collapsed move 30→12 still did not stick on those engines, so the call is not sufficient even when the function returns early.
2. `packages/rendering/dom/src/field-editor/contenteditableBackendCore.ts` **324–325** — `editorSelectionToDOM(root, anchor, focus)` is the backend call site.
3. `packages/rendering/dom/src/field-editor/fieldEditorImplRuntime.ts` **252–269** — non-collapsed authority now forces `updateSelection`; collapsed stays gated on a pending rAF. The forced range path still does not move Gecko/WebKit native selection.
4. `packages/rendering/dom/src/field-editor/fieldEditorImplRuntime.ts` **407–423** (`_handleHistoryApplied`) — attaches and focuses the restored inline, then `completeDeferredProjection` without `updateSelection`. Firefox evidence below is the result.
5. `packages/rendering/dom/src/field-editor/selectionProjectionController.ts` **320, 350** — existing rAFs. Do not add a third. S4.
6. `packages/rendering/dom/src/field-editor/contenteditableBackendSelection.ts` **262–296** — `shouldRestoreStaleFullBlockSelection` explains why a triple-click / `addRange` full-block native range is reverted while authority is still a caret. It does not license dropping an authority write.

## Firefox / WebKit history — same projector family

`artifacts/firefox-history-topbar-redo.json` immediately after toolbar redo:

- `editorSelection`: new block, offset 0
- `activeElement.blockId` / `attachedInlineBlockId`: new block
- `native`: **old** block, offset 5, text node `"Hello"`

WebKit’s snapshot at the same instant (`artifacts/webkit-history-topbar-redo.json`) is the same split. WebKit’s 10s poll later matches. Firefox’s poll does not.

So: one projector that does not write native selection when authority moves. Symptom A is a same-block range (`nativeSelection`). Symptom B is a cross-block collapsed caret (history redo). WebKit heals B inside the e2e poll and never runs A (skip). Firefox heals neither.

Same-block history (caret stays on one paragraph) passed on all three confirm/residual runs.

## M6 Backspace — not used for promotion

Conformance was **not** clean this round. Two official `m6-delete-logical` matrices:

| When | Chromium | WebKit Backspace | Firefox Backspace |
| ---- | -------- | ---------------- | ----------------- |
| 09:50 UTC, concurrent load | both pass | **S2 fail** | **S2 fail** |
| 09:56 UTC, harness mid-edit | `domMatchesAuthority` undefined / missing block | pass | pass |

A playground dump (`artifacts/*-m6-s2.json`) at 09:56 showed Chromium/WebKit authority=DOM=7 with text `مرحبا Hllo`, and a Firefox click that never left the Latin embed (RTL geometry miss in the dump, not a scenario result).

That is not a clean 7-vs-8 capture. It does **not** prove M6 and `nativeSelection` share one root cause. It also does **not** prove M6 is fixed. Leave conformance `continue-on-error` as-is. Re-run the official scenario on a quiet harness before anyone cites M6.

## Chromium `selectAll` flake

First full matrix: after `ControlOrMeta+A`, `selectedText` stayed `""` for 10s. Isolated confirm: pass. Firefox/WebKit `selectAll` passed in every run that executed it. Classification: **test artifact under concurrent load**, not a Chromium hold.

## Runs (all concurrent `packages/**` load)

| Run | What | Result |
| ---- | ---- | ------ |
| 09:50 e2e full 3-engine | original 12 × 3 | 32 pass / 3 fail / 1 skip |
| 09:50 M6 official | 2 scenarios × 3 | 4 pass / 2 fail (WK+FF Backspace S2) |
| 09:52 e2e isolated residuals | selectAll + history + nativeSelection × 3 | 12 pass / 5 fail / 1 skip |
| 09:54 evidence probe | authority vs `addRange` × 3 | 3 pass (capture only) |
| 09:54 FF+WK residual | history + nativeSelection | WK history 3/3; FF history 1/3 + nativeSelection fail |
| 09:55 Chromium confirm | original 12 | **12/12** |
| 09:56 WebKit confirm | original 12 | **11/12 + skip** |
| 09:56 M6 dump / official rerun | harness unstable | do not cite |

## Verify the projector fix when it lands

Run, in order, on a quiet tree with a freshly started `dev:e2e` server:

```bash
pnpm exec playwright test playground/e2e/enginePromotionEvidence.spec.ts
pnpm exec playwright test playground/e2e/nativeSelection.spec.ts playground/e2e/history.spec.ts --project=firefox
pnpm exec playwright test playground/e2e/aiSuggestions.spec.ts playground/e2e/debug-boot.spec.ts playground/e2e/history.spec.ts playground/e2e/inlineSession.spec.ts playground/e2e/nativeSelection.spec.ts playground/e2e/selectAll.spec.ts playground/e2e/streaming.spec.ts
```

The evidence spec must show `authorityRangeProjected: true` on Firefox (and WebKit). `artifacts/firefox-nativeSelection.json` must show native text `Alpha bravo charlie delta echo`. Firefox history redo must show native `blockId === redoneBlockId` at the first snapshot, not after a 10s poll.

Do not add `test.skip` / `test.fixme`. Do not add rAF to selection paths. Do not widen a tolerance.
