# DOM Scheduling, Geometry, And Bidi

These families govern how Pen reads and writes the DOM and how bidirectional text is resolved, measured, and navigated. The scheduling, geometry, and overlay set (SCH, G, OV) is enforced in `packages/rendering/dom/src/scheduler.ts` and `packages/rendering/dom/src/geometry/`, with the framework renderers bound to its paint-plan output rather than measuring on their own. The bidi and direction set (DIR, BR, M, RI) is enforced in `packages/rendering/dom/src/bidi/` for level resolution and in `packages/core/src/direction/` plus `packages/core/src/facets/directionFacets.ts` for direction resolution and motion semantics.

## SCH — DOM scheduler

`DomScheduler` exposes `read`, `write`, `measureNow`, and a `phase` of `"idle" | "read" | "write"`. One flush runs per animation frame when work is pending: it collects the commits since the last flush plus the current selection record, runs the read phase (geometry cache invalidation, then queued reads in FIFO order), then runs the write phase (renderer DOM updates, queued writes FIFO, the selection projector last so it sees final layout, then overlay paints). A write queued during the read phase joins the same flush; a read queued during the write phase moves to the next flush and emits `diagnostic { code: "read-after-write" }` when it observes layout that write invalidated.

- SCH1. Pen-internal code — the selection projector, overlays, and geometry — never calls `getBoundingClientRect`, `getClientRects`, `elementFromPoint`, or `caretPositionFromPoint` outside a read phase or `measureNow`. The gate is `scripts/no-unscheduled-measure.mjs`, scoped to `@input/pen-dom`, `@input/pen-react`, and `@input/pen-vue`.
- SCH2. `measureNow` is the synchronous escape hatch for command handlers that need geometry during dispatch, such as vertical caret motion. Each call forces a flush boundary and increments a counter surfaced in diagnostics, and the perf budget caps that counter.
- SCH3. The scheduler is per editor root. Multiple editors on a page never share read or write queues.

Budgets, enforced by the conformance perf tests: one flush per frame, and zero flushes when no work is pending, so an idle typing pause produces no scheduler activity; in typing steady state (single caret, 60cps synthetic) at most one `measureNow` per keystroke, with read phase ≤ 2ms and write phase ≤ 2ms at p95 on the 10k-word reference fixture in CI Chromium; eight active remote carets add no layout passes beyond the flush's single read phase. The committed Chromium baseline records a 3.4ms read phase against that 2ms line, but the timed flush belongs to a second scheduler the harness constructs and no keystroke path runs it. The production read phase is therefore unmeasured, and the budget stays at 2ms rather than being raised to match a harness measurement.

## G — geometry reader

All measurement flows through one `GeometryReader` (`packages/rendering/dom/src/geometry/geometryReader.ts`) that returns plain data, so no live DOM reference escapes into consumer code. It exposes `caretRect`, `rangeRects`, `lineBoxes`, `pointAt`, `blockRect`, and a `generation` counter that consumers use as a cache key. `rangeRects` decomposes a logical range into per-run rects, so an RTL-embedded range inside an LTR line yields visually correct disjoint rects instead of one wrong spanning rect, and `LineBox.runs` carries `{ run, rect }` pairs in visual order. A host that needs custom measurement writes its own code outside Pen's phases; geometry re-exports no raw DOM nodes.

- G1. Geometry is measured with `Range.getClientRects()` over text nodes resolved through `packages/rendering/dom/src/field-editor/offsetDomain.ts`, never with per-character spans. An atom's rect comes from the atom's host element.
- G2. Geometry is cached per block, keyed by the commit id of the last summary touching that block plus the viewport-resize and font-load generations. The read-phase invalidation scan drops entries for blocks named in the flush's summaries, and a `ResizeObserver` on the content root and `document.fonts.ready` bump the global generations.
- G3. `caretRect` at a bidi-run boundary or a line wrap returns the rect on the side named by `affinity`: `"downstream"` is the run or line box containing the position when scanning forward in logical order, `"upstream"` the one found scanning backward.
- G4. `pointAt` resolves a coordinate through `caretPositionFromPoint`/`caretRangeFromPoint` and then snaps to the nearest normal position. Coordinates outside every block map to the nearest block edge in the vertical band, so a click below the document selects the last position.
- G5. Vertical caret motion (`pen.caretUp`, `pen.caretDown`) is computed from geometry rather than delegated to the browser: take `x = goalX ?? caretRect(current, affinity).centerX`, find the adjacent `LineBox` in the motion direction (same block, else the visually adjacent block by `blockRect` order), and target `pointAt(x, y clamped into that line box)`. `goalX` persists on the resulting selection.

## OV — overlay contract

Overlays — the caret overlay, multiplayer carets, AI decoration outlines, drop indicators, and block or cell selection highlights — are pure functions of records, facet outputs, and geometry snapshots.

- OV1. Overlays subscribe to flushes, not to raw events: they receive `(commits, selectionRecord, reader)` in the read phase, compute a paint plan of plain data, and paint that plan in the write phase. Event-driven painting is not an available path.
- OV2. Overlay DOM lives in the dedicated overlay layer element per editor root, a sibling of content under a `position: relative` root, painted with transforms only and never with layout-inducing properties. It is `pointer-events: none` except for explicitly interactive handles.
- OV3. The React and Vue overlay primitives are bindings over the paint-plan API (`onPaintPlan(cb)`) and hold no measurement code of their own.

## DIR — block direction resolution

A block's direction resolves in order, first hit winning: the explicit `props.direction` prop (`"ltr" | "rtl" | "auto"`, where `"auto"` falls through), the `pen.blockDirection` facet resolvers in facet order (first non-null, which is how a host implements inherited direction such as a reply-quote block taking the quoted mail's direction), the UAX#9 P2/P3 first-strong heuristic over the block's logical text, then the `pen.defaultDirection` facet (single-value, default `"ltr"`). Per-paragraph directionality UI and RTL mirroring of host chrome are host concerns.

- DIR1. Direction resolution is cached per block and invalidated when the block's text or props appear in a commit summary, or when facet outputs change.
- DIR2. Renderers set `dir` on the block's content host element from Pen's resolved direction and never emit `dir="auto"`, because resolution is Pen's rather than the browser's and measurement must agree with rendering.
- DIR3. Direction is per block. Nested blocks resolve independently, so a quote block may resolve `rtl` inside an `ltr` document.

## BR — bidi run resolution

`packages/rendering/dom/src/bidi/levels.ts` implements `computeBidiRuns(text, base)`, returning logical `{ from, to, level }` runs where even levels are LTR and odd are RTL. Remote carets and decorations inherit RTL correctness through `rangeRects` and `caretRect`; no per-feature bidi code is permitted outside `bidi/` and `geometry/`.

- BR1. The implementation covers the UAX#9 rules an editor needs — P, X including the LRI/RLI/FSI/PDI isolates, W, N, I, and enough L1/L2 reordering to produce runs — and is accepted against the committed BidiTest character-class vector subset rather than the full BidiTest suite, which is overkill for run-level output.
- BR2. Atomic inline nodes take Bidi_Class ON (neutral) and always form their own run boundary.
- BR3. Runs are cached with the block geometry cache and share its invalidation (G2).
- BR4. Bidi level resolution lives in-tree with its vector suite and adds no dependency. `Intl.Segmenter` remains the only text-segmentation dependency, for graphemes and words, and is unrelated to bidi levels.

## M — motion semantics

Direction affects which key advances the caret, not how a caret is represented: Pen renders one caret plus affinity and never splits a caret at a direction boundary.

- M1. `pen.caretLeft` and `pen.caretRight` move in logical order regardless of run direction — Right is the next normal position, Left the previous. The names exist for keymap familiarity; there is no visual-order motion mode, because logical motion is stable under editing and never strands the caret.
- M2. In a block whose resolved direction is `rtl`, the default keymap swaps the bindings — `ArrowLeft` dispatches `pen.caretRight` (logical forward) and `ArrowRight` dispatches `pen.caretLeft` — so pressing toward the text's reading direction advances in reading order. The swap is resolved from the focus block's direction at keymap dispatch, and the `extend` variants swap identically.
- M3. `pen.caretLineStart` and `pen.caretLineEnd` are visual: they target the visually first and last position of the line box, so in an `rtl` line LineStart is the right edge and Home/End do what the user sees.
- M4. `pen.caretWordLeft` and `pen.caretWordRight` follow the M1 and M2 semantics at word granularity.
- M5. Vertical motion (G5) is pure geometry and therefore direction-neutral; it has no bidi cases.
- M6. `pen.deleteBackward` and `pen.deleteForward` are strictly logical — backward is the previous logical grapheme — and are never swapped by direction, because deletion semantics track insertion order.

## RI — rendering and input

Exporters emit text as stored: Pen inserts no LRM or RLM direction marks on export.

- RI1. The content root gets `unicode-bidi: isolate` per block host, and marks or decorations must not introduce `bidi-override`. The gate is `scripts/no-bidi-override.mjs` over style objects in the DOM and framework renderer packages.
- RI2. IME composition inside an RTL run needs no special handling beyond the ordinary composition rules: composition owns the field, and geometry reads resume after it ends.
- RI3. Pasted mixed-direction text is plain content. Direction resolution reacts through DIR1 invalidation rather than through a paste-specific path.
- RI4. The overlay caret measures through `caretRect` and so inherits bidi correctness, and the native caret inside the active field agrees because DIR2 sets `dir` on the same element the browser measures.

## Retired

No member of SCH, G, OV, DIR, BR, M, or RI is retired. The geometry rules no longer depend on a storage sentinel: the `\u200B` empty-block sentinel that G1's original wording measured through is gone from storage, so offsets resolve through `offsetDomain.ts` alone and no measurement path tests for a sentinel.
