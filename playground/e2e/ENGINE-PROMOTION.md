# Playground e2e engine promotion

## 2026-08-21 13:34– UTC — Enter-split stamp survives session switch

Quiet confirm on HEAD `09c1fc5` plus this fix. 14-core Darwin. 1-minute loadavg stayed between **2.5 and 6.8**. No `turbo` / `vitest` during the browser runs. Vite e2e (`PEN_E2E=1`, `watch: null`) serves `@input/pen-dom` from **dist**, not `packages/**/src` — core is aliased to source; DOM is not. Rebuild `pen-dom` after source edits or the playground will keep the old bundle.

### Observed write sequence (WebKit, live)

Authority **moves** to the new block, then a leftover native range writes it back. The previous lane's T0 dump ("never moves") was the state _after_ that overwrite.

1. `keydown` Enter → `pen.splitBlock`. `onCommit` maps first@5 through the split onto **inserted@0** (`origin: "mapped"`, `emit: false`). Registry `commitSelection` coalesces. New block host is **not** focused yet.
2. `activateFieldEditorFromSelection` → `commitProgrammaticTextSelection(inserted, 0, 0)` stamps the new caret, then `activate(inserted)` → `_startSession` → `_deactivate` → `selectionCoordinator.reset()`, which **wiped the stamp**.
3. Projection attaches and focuses the new inline. Native briefly sits on inserted@0.
4. `keyup` Enter: WebKit leaves `window.getSelection()` on **first@5** while `activeElement` stays on the new span.
5. `selectionchange` → `applyDomTextSelection(first@5)` overwrites authority, because `shouldIgnoreDomTextSelection` had no stamp left.

Firefox is the same leftover-native overwrite. Chromium (EditContext) never takes this backend path.

### Previous lane's three changes (09c1fc5)

| Change                                                                       | Verdict                                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `splitBlockAtOffset` `{ origin: "user" }` + `selectText`                  | **Keep.** Correct for the fallback. Dead on this playground path: production Enter is `pen.splitBlock` via the keymap.                                   |
| 2. `insertParagraph` / `activateFieldEditorFromSelection` programmatic stamp | **Keep.** This is the stamp that step 2 sets. Necessary, not sufficient.                                                                                 |
| 3. `shouldIgnoreDomTextSelection` ignores leftover native on another block   | **Keep.** Node-tested and live-correct **once the stamp survives**. Dead on the live path before this fix because `reset()` cleared it in the same turn. |

### Fix

`_startSession` peeks a programmatic stamp that already targets the new block, then restores it after the session-switch `reset()`. The keyup leftover is ignored and DOM is restored from authority. No rAF, no poll widening.

### Gate (clean dist, traces removed)

```bash
pnpm exec playwright test playground/e2e/history.spec.ts --project=<engine> --reporter=list --workers=1
```

| Engine   | Result  | Notes                                           |
| -------- | ------- | ----------------------------------------------- |
| WebKit   | **3/3** | Blocking engine. Enter caret now on inserted@0. |
| Firefox  | **3/3** | Same leftover-native path now ignored.          |
| Chromium | **3/3** | Still green; EditContext path unchanged.        |

Re-run after stripping temporary traces and rebuilding `@input/pen-dom`. Same 3/3 on each engine (load 8.07 → 7.47).

### Original 12 — sequential, 1 worker, frozen server

```bash
pnpm exec playwright test \
  playground/e2e/aiSuggestions.spec.ts \
  playground/e2e/debug-boot.spec.ts \
  playground/e2e/history.spec.ts \
  playground/e2e/inlineSession.spec.ts \
  playground/e2e/nativeSelection.spec.ts \
  playground/e2e/selectAll.spec.ts \
  playground/e2e/streaming.spec.ts \
  --project=<engine> --reporter=list --workers=1
```

| Engine   | Result                 | Playwright | loadavg start       | loadavg end         |
| -------- | ---------------------- | ---------- | ------------------- | ------------------- |
| Chromium | **12/12**              | 20.6s      | 7.67 / 6.99 / 14.29 | 7.44 / 6.98 / 14.12 |
| WebKit   | **11 passed / 1 skip** | 21.5s      | 7.33 / 6.97 / 14.08 | 7.30 / 6.97 / 13.91 |
| Firefox  | **12/12**              | 31.2s      | 7.60 / 7.05 / 13.86 | 7.48 / 7.13 / 13.61 |

WebKit skip is the pre-existing `nativeSelection` filter. Both cross-block history tests passed on all three. Firefox `nativeSelection` passed.

### Firefox promote

**Superseded the same hour by an independent re-derivation. Firefox is NOT promotable. The Enter-split half of this claim holds; the `12/12` does not.**

The coordinator re-ran the identical command set on the same quiet machine (loadavg 5.5–8.6 throughout, nothing else running) and got:

| Engine   | Result                   | Notes                                                      |
| -------- | ------------------------ | ---------------------------------------------------------- |
| Chromium | **12/12**                | matches                                                    |
| WebKit   | **11 passed / 1 skip**   | matches; skip is the pre-existing `nativeSelection` filter |
| Firefox  | **11 passed / 1 FAILED** | `selectAll.spec.ts:12`                                     |

The Enter-split fix is fully confirmed and is not in question: `history.spec.ts` is **3/3 on all three engines**, independently reproduced, and the suite time dropped from 28.8s to 5.1s because the 10-second polls now succeed immediately instead of timing out. That was the hold, and it is genuinely gone.

**What replaced it is a different and more interesting defect.** `selectAll.spec.ts:12` on Firefox:

- fails **in-suite 3 times out of 3** (the original run plus two repeats), always at 10.7s, and
- passes **isolated 3 times out of 3**, in 1.3s each,

on a machine at loadavg ~6 with nothing else running. That is **deterministic and order-dependent**, so it is neither a flake nor a load artifact — it is test pollution or shared state leaking from an earlier spec in the run.

**This retroactively reclassifies an earlier entry in this document.** The Chromium `selectAll` miss recorded further down was filed as a "test artifact under concurrent load" on exactly the evidence pattern seen here — fails in the suite, passes isolated. That inference was reasonable at the time and is now doubtful: the same signature reproduces on a quiet machine, so load was probably an aggravator rather than the cause. Chromium currently passes `selectAll` in-suite, but nothing here explains why it should be immune, and a latent ordering dependency that only sometimes fires is worse than one that always does.

Before Firefox is promoted again, find which earlier spec leaves the state that breaks `selectAll`, rather than re-running until it is green. Bisecting the spec list is the cheap first move.

CI change is therefore **not** made. The gate stays `continue-on-error: ${{ matrix.engine == 'firefox' }}`. For the record, when it is eventually promoted:

CI change (not made here; `.github/workflows/ci.yml` is a separate edit):

```yaml
# after this report
continue-on-error: false
# or drop the firefox exception so all three engines block
```

Do not keep `continue-on-error: ${{ matrix.engine == 'firefox' }}` on the strength of an inherited hold. This run meets the promote bar from the 12:56 section: original 12 green **and** history native `blockId === inserted` at the first snapshot.

---

## 2026-08-21 12:56–13:06 UTC — Firefox hold (quiet confirm)

Attempted on clean HEAD `9116782`. **Do not promote Firefox. Do not flip the gate.** `continue-on-error` stays `${{ matrix.engine == 'firefox' }}`.

This is a measurable run. 14-core Darwin. 1-minute loadavg stayed between **2.65 and 6.24** for every engine (well under 14). No `turbo` / `vitest` / other Playwright on this tree. The only leftover process was an unrelated Input-repo Vite. Backend `/health` stayed `200`. Fresh `dev:e2e` (`PEN_E2E=1`, `watch: null`, HMR off) + backend frozen at 12:56:55 UTC against the clean tree.

```text
12:56 start   up 4:49   load 5.06 22.36 31.01   (5/15 are decay from the prior batch)
12:56:53      up 4:50   load 4.43 20.83 30.21   servers starting
12:57:03      up 4:50   load 4.52 20.31 29.92   chromium selectAll start
13:06 end     up 4:59   load 4.58  6.19 16.58
pgrep vitest|turbo|playwright|vite on this tree: none (one Input-repo vite only)
```

### Verdict: hold

The previous hold (same-block `selectTextRange(0, 30)` never reaching `window.getSelection()`) is **gone** on this tree. That is not enough to promote.

Firefox is still not 12/12. Both cross-block history tests fail **before undo/redo**, immediately after `Enter`. The same two tests fail on **WebKit**, which is already a blocking engine. Chromium is 12/12, including `selectAll`.

Do not treat the projector-fix reasoning (synchronous projection, deleted rAFs, `SelectionAuthority`) as a promote. The evidence spec is green; the original 12 is not.

### Chromium `selectAll` — settled first

Blocking-engine question from the last attempt, isolated on this quiet machine **before** any Firefox suite:

```bash
pnpm exec playwright test playground/e2e/selectAll.spec.ts \
  --project=chromium --reporter=list --workers=1
```

**2 passed (2.2s)**, `real 3.18`. `selectAll.spec.ts:12` 555ms, slash-menu 395ms. Load 4.52 → 4.32. `/health` 200.

Then again inside Chromium original 12 (also `--workers=1`): `selectAll.spec.ts:12` 438ms, pass.

The last attempt's empty `selectedText` through a 10s poll does **not** reproduce here. Classify that earlier miss as a load artifact. Chromium `selectAll` is not a regression on `9116782`.

### Evidence spec — `authorityRangeProjected`

```bash
pnpm exec playwright test playground/e2e/enginePromotionEvidence.spec.ts --project=<engine> --workers=1
```

| Engine   | Result          | Wall (`time -p`) | loadavg start        | `authorityRangeProjected` |
| -------- | --------------- | ---------------- | -------------------- | ------------------------- |
| Chromium | 1 passed, 658ms | real 2.49        | 4.45 / 19.78 / 29.61 | **true** (t0)             |
| WebKit   | 1 passed, 1.8s  | real 4.00        | 4.34 / 19.50 / 29.46 | **true** (t0)             |
| Firefox  | 1 passed, 1.6s  | real 4.11        | 4.75 / 18.62 / 28.91 | **true** (t0)             |

`artifacts/firefox-projection.json` after `editor.selectTextRange(0, 30)` at t0: authority range 0–30 **and** native text `Alpha bravo charlie delta echo`. Same table on WebKit. The hardcoded `concurrentPackagesLoad: true` in that spec is stale; this run was not under package-write load.

Firefox `nativeSelection.spec.ts` **passed**. `artifacts/firefox-nativeSelection.json` (14:58:20) shows `usedAuthorityFallback: true` (triple-click still a caret) and after the authority write native text `Alpha bravo charlie delta echo`. That pass criterion is met.

Untrusted `addRange` still does not stick on Firefox (`untrustedAddRangeStuck: false`). That is §4.1, not a hold.

### Original 12 — sequential, 1 worker, frozen server

```bash
pnpm exec playwright test \
  playground/e2e/aiSuggestions.spec.ts \
  playground/e2e/debug-boot.spec.ts \
  playground/e2e/history.spec.ts \
  playground/e2e/inlineSession.spec.ts \
  playground/e2e/nativeSelection.spec.ts \
  playground/e2e/selectAll.spec.ts \
  playground/e2e/streaming.spec.ts \
  --project=<engine> --reporter=list --workers=1
```

| Engine   | Result                         | Playwright | `real` | loadavg start        | loadavg end          |
| -------- | ------------------------------ | ---------- | ------ | -------------------- | -------------------- |
| Chromium | **12/12**                      | 19.5s      | 20.50  | 3.83 / 14.88 / 26.49 | 6.13 / 14.70 / 26.16 |
| WebKit   | **9 passed / 1 skip / 2 fail** | 42.2s      | 43.12  | 6.13 / 14.70 / 26.16 | 4.86 / 13.15 / 25.00 |
| Firefox  | **9 passed / 3 fail**          | 1.0m       | 61.66  | 4.87 / 12.75 / 24.65 | 5.95 / 11.72 / 23.46 |

Logs: `/tmp/e2e-chromium-original12.log`, `/tmp/e2e-webkit-original12.log`, `/tmp/e2e-firefox-original12.log`.

Firefox residual first (`nativeSelection` + `history`, `--workers=1`, load 4.39 → 4.37): 2 passed / 2 failed, `real 30.17`. Same two history fails as the original 12.

### What fails — and what the first snapshot actually is

Both failing history tests die at `history.spec.ts:75` and `history.spec.ts:121` (`expectCaretPosition` at line 158), **after `Enter`, before undo**. They never reach redo. `artifacts/firefox-history-*-redo.json` / `artifacts/webkit-history-*-redo.json` were **not rewritten** this run (still 11:57 timestamps). Do not cite them.

Failure shape, 10s poll, 1 worker, quiet machine, reproduced on Firefox residual + Firefox original 12 + WebKit original 12:

- expected native: inserted block, offset 0
- received native: first block, offset 5 (`"Hello"`)

Same-block history (`history.spec.ts:26`) passed on all three.

Official-path dump (same click / type / 450ms settle / Enter as the spec; not a product test):

| Engine   | After Enter t0 authority | After Enter t0 native | Attach                          |
| -------- | ------------------------ | --------------------- | ------------------------------- |
| Chromium | inserted @ 0             | inserted @ 0          | inserted                        |
| WebKit   | **first @ 5**            | **first @ 5**         | **lost** (`activeElement` BODY) |
| Firefox  | **first @ 5**            | **first @ 5**         | stays on first                  |

Artifacts: `artifacts/chromium-history-enter.json`, `artifacts/webkit-history-enter.json`, `artifacts/firefox-history-enter.json`.

This is **not** the previous S1/S2 projector miss. The projector had a new range to write and wrote it (`authorityRangeProjected: true`). After Enter the authority **never moves** onto the new block on Firefox/WebKit, so there is nothing new to project. Chromium moves authority, attach, and native together.

`pen.splitBlock` (`packages/core/src/commands/text.ts:542`) returns `{ selection: collapsedAt(newBlockId, 0) }` and the registry commits that (`packages/core/src/commands/registry.ts:177`). The fallback `splitBlockAtOffset` (`packages/rendering/dom/src/field-editor/commandsBlock.ts:49`) applies the op and does **not** write `editor.selection`. This report does not claim which path ran — only that on Firefox/WebKit the split exists and authority stayed on the first block through t0 and two rAFs. Do not add a rAF to "heal" it.

### Firefox `selectAll` in the original 12

`selectAll.spec.ts:12` failed once in the Firefox original 12 (`selectedText` stayed `""` for 10s), then **passed isolated** on the same quiet machine, same frozen server, `--workers=1`, 1.4s (`real 3.51`, load 5.53). Chromium `selectAll` passed both isolated and in-suite. Do not use the one Firefox suite miss as the hold. History is the hold.

### Gate and branch protection

Left alone:

```yaml
continue-on-error: ${{ matrix.engine == 'firefox' }}
```

Do **not** add `e2e-firefox` as a required check.

WebKit is already blocking. This quiet confirm is **not** green for WebKit (`history.spec.ts:60` and `:108`). A required `e2e-webkit` check will fail merges on this tree until that Enter-split selection write is fixed. Do not paper it with `test.skip` / `test.fixme` / a retry / a wider poll.

### Next attempt

Quiet machine, fresh `dev:e2e`, then in order:

1. Chromium original 12 (confirm `selectAll` still green).
2. WebKit original 12 (blocking engine; Enter-split must pass before anyone talks about Firefox).
3. Evidence spec Firefox + `nativeSelection` (should stay green).
4. Firefox `history.spec.ts` — if it still dies at line 75, dump authority vs native after Enter again; do not bother with redo snapshots until that assertion passes.

Promote Firefox only if the original 12 is fully green **and** reproducible **and** `authorityRangeProjected: true` **and** history redo native `blockId === redoneBlockId` at the first snapshot. This run meets the evidence-spec and nativeSelection criteria and misses the original 12.

---

## 2026-08-21 12:42–12:46 UTC — Firefox re-confirm: not measurable

Attempted on HEAD `3f2ecae` after `SelectionAuthority` and synchronous `syncDomSelectionOnce`. **Do not promote Firefox from this attempt. Do not treat the Chromium miss below as a regression.** Gate left as `continue-on-error: ${{ matrix.engine == 'firefox' }}`.

Machine: 14-core Darwin. Other lanes were running `pnpm build` / `pnpm turbo run test` against the same tree. Vite e2e (`PEN_E2E=1`, `watch: null`, HMR off) and backend were started at 12:42:53 UTC against the dirty working tree (field-editor / react / extension writes in flight; freeze list is in the run table). Playground aliases `packages/**/src`, so the frozen server is source-at-start, not `dist/`.

### Verdict: not measurable

Load during the only suite that ran was already past saturation. It then climbed far past any number that can be cited as an engine result:

| When                              | loadavg (1 / 5 / 15)       |
| --------------------------------- | -------------------------- |
| build start                       | 12.76 / 14.46 / 20.63      |
| server freeze 12:42:49Z           | 15.72 / 15.08 / 20.71      |
| Chromium confirm start            | **30.29** / 18.35 / 21.78  |
| Chromium confirm end (14.1s wall) | 25.62 / 17.90 / 21.55      |
| isolated `selectAll` start        | 29.25 / 18.78 / 21.84      |
| after 45s wait                    | 35.90 / 21.41 / 22.67      |
| after 60s more wait               | **124.94** / 51.59 / 34.08 |
| stop                              | **158.22** / 63.91 / 38.90 |

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

| Engine   | Confirm run (original 12) | First full matrix (dirty, 7 workers)     | Recommendation          |
| -------- | ------------------------- | ---------------------------------------- | ----------------------- |
| Chromium | **12/12**                 | 11/12 (`selectAll` empty `selectedText`) | **Promote to blocking** |
| WebKit   | **11/12 + 1 skip**        | 10/12 (`history` topbar once)            | **Promote to blocking** |
| Firefox  | not 12/12                 | 11/12 (`nativeSelection`)                | **Hold**                |

CI change (not made; `.github/workflows/ci.yml` is outside this fence):

```yaml
# today
continue-on-error: ${{ matrix.engine != 'chromium' }}
# after this report
continue-on-error: ${{ matrix.engine == 'firefox' }}
```

Do not flip Firefox. Do not flip conformance `continue-on-error`.

## Original 12 specs

| Spec                                      | Chromium confirm                     | WebKit confirm                       | Firefox reproduced                               |
| ----------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------ |
| `aiSuggestions` styling                   | pass                                 | pass                                 | pass (full matrix)                               |
| `aiSuggestions` apply                     | pass                                 | pass                                 | pass                                             |
| `aiSuggestions` dismiss                   | pass                                 | pass                                 | pass                                             |
| `debug-boot`                              | pass                                 | pass                                 | pass                                             |
| `history` same-block undo/redo            | pass                                 | pass                                 | pass                                             |
| `history` topbar cross-block              | pass                                 | pass (confirm); fail once under load | **fail** (authority on new block, native on old) |
| `history` keyboard cross-block            | pass                                 | pass (confirm); fail once under load | **fail** (same split as topbar)                  |
| `inlineSession` overlay                   | pass                                 | pass                                 | pass                                             |
| `nativeSelection` triple-click then caret | pass                                 | **skip** (pre-existing)              | **fail** (authority 0–30, native caret 30)       |
| `selectAll` cmd+a                         | pass (confirm); fail once under load | pass                                 | pass                                             |
| `selectAll` slash Table                   | pass                                 | pass                                 | pass                                             |
| `streaming` delta-stream                  | pass                                 | pass                                 | pass                                             |

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

| Step                                 | Authority               | Native   |
| ------------------------------------ | ----------------------- | -------- |
| after type                           | caret 30                | caret 30 |
| triple-click t0                      | caret 30                | caret 30 |
| triple-click t2raf                   | **range 0–30**          | caret 30 |
| `selectTextRange(12,12)`             | caret 12                | caret 30 |
| `selectTextRange(0,30)` t0 and t2raf | **range 0–30**          | caret 30 |
| untrusted `addRange`                 | caret 12 (not accepted) | caret 30 |

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

| When                        | Chromium                                        | WebKit Backspace | Firefox Backspace |
| --------------------------- | ----------------------------------------------- | ---------------- | ----------------- |
| 09:50 UTC, concurrent load  | both pass                                       | **S2 fail**      | **S2 fail**       |
| 09:56 UTC, harness mid-edit | `domMatchesAuthority` undefined / missing block | pass             | pass              |

A playground dump (`artifacts/*-m6-s2.json`) at 09:56 showed Chromium/WebKit authority=DOM=7 with text `مرحبا Hllo`, and a Firefox click that never left the Latin embed (RTL geometry miss in the dump, not a scenario result).

That is not a clean 7-vs-8 capture. It does **not** prove M6 and `nativeSelection` share one root cause. It also does **not** prove M6 is fixed. Leave conformance `continue-on-error` as-is. Re-run the official scenario on a quiet harness before anyone cites M6.

## Chromium `selectAll` flake

First full matrix: after `ControlOrMeta+A`, `selectedText` stayed `""` for 10s. Isolated confirm: pass. Firefox/WebKit `selectAll` passed in every run that executed it. Classification: **test artifact under concurrent load**, not a Chromium hold.

## Runs (all concurrent `packages/**` load)

| Run                            | What                                      | Result                                                |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------- |
| 09:50 e2e full 3-engine        | original 12 × 3                           | 32 pass / 3 fail / 1 skip                             |
| 09:50 M6 official              | 2 scenarios × 3                           | 4 pass / 2 fail (WK+FF Backspace S2)                  |
| 09:52 e2e isolated residuals   | selectAll + history + nativeSelection × 3 | 12 pass / 5 fail / 1 skip                             |
| 09:54 evidence probe           | authority vs `addRange` × 3               | 3 pass (capture only)                                 |
| 09:54 FF+WK residual           | history + nativeSelection                 | WK history 3/3; FF history 1/3 + nativeSelection fail |
| 09:55 Chromium confirm         | original 12                               | **12/12**                                             |
| 09:56 WebKit confirm           | original 12                               | **11/12 + skip**                                      |
| 09:56 M6 dump / official rerun | harness unstable                          | do not cite                                           |

## Verify the projector fix when it lands

Run, in order, on a quiet tree with a freshly started `dev:e2e` server:

```bash
pnpm exec playwright test playground/e2e/enginePromotionEvidence.spec.ts
pnpm exec playwright test playground/e2e/nativeSelection.spec.ts playground/e2e/history.spec.ts --project=firefox
pnpm exec playwright test playground/e2e/aiSuggestions.spec.ts playground/e2e/debug-boot.spec.ts playground/e2e/history.spec.ts playground/e2e/inlineSession.spec.ts playground/e2e/nativeSelection.spec.ts playground/e2e/selectAll.spec.ts playground/e2e/streaming.spec.ts
```

The evidence spec must show `authorityRangeProjected: true` on Firefox (and WebKit). `artifacts/firefox-nativeSelection.json` must show native text `Alpha bravo charlie delta echo`. Firefox history redo must show native `blockId === redoneBlockId` at the first snapshot, not after a 10s poll.

Do not add `test.skip` / `test.fixme`. Do not add rAF to selection paths. Do not widen a tolerance.
