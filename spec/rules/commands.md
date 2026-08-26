# Command Rules

Every editing action is a named, parameterized, headlessly testable dispatch point that extensions override with facet precedence. `D` governs dispatch and results, `K` governs the keymap, and `B` governs the `beforeinput` translation table. Contracts live in `@input/pen-types` (`packages/types/src/types/commands.ts`); the registry, built-in handlers, and the frozen catalog live in `@input/pen-core` (`packages/core/src/commands/`, with the catalog in `CATALOG.md` and the default bindings in `defaultKeymap.ts`); `@input/pen-dom` owns only the key and input translation (`packages/rendering/dom/src/field-editor/keymap.ts`, `beforeinputMap.ts`) and holds no editing behavior of its own. The command registry and catalog are settled — enter and delete behavior, list and layout indent, caret motion, table cell navigation, and the select-all ladder are core commands, not renderer code.

## D — Dispatch

- D1. The handlers for a command are the `pen.commands` facet output filtered by command name, in facet order (see R1 in `spec/rules/facets.md`). Dispatch tries each handler until one returns a result other than `false`; with no handler, `dispatch` returns `false`.
- D2. Result handling is fixed: `{ ops }` becomes exactly one `editor.apply(ops, { origin: context.origin ?? "user", ...options })`, `{ selection }` becomes one authority write with origin `"keyboard"` when the dispatch came from the keymap and `"programmatic"` otherwise, and `true` means the handler already performed its effects through public editor APIs. A handler must not both apply internally and return ops; doing so emits a `command-double-effect` diagnostic.
- D3. Dispatch is synchronous and non-reentrant. A command dispatched from inside a handler is queued after the current dispatch completes, on the same queue as nested applies.
- D4. `canDispatch` calls handlers with `editor.probe`, a read-only editor view whose apply and selection writes record intent without executing, and a handler is capable when it would return a result other than `false`. Handlers must therefore be side-effect-free until they commit to a result; the probe makes violations loud in tests.
- D5. Every built-in behavior is registered at `default` precedence, so an extension using `high` or `highest` overrides it without ordering tricks. AI suggest mode registers `highest`-precedence handlers for the commands it must reinterpret — deleting across a suggestion boundary, splitting inside a suggested range — and returns suggestion ops instead, leaving the op-level `pen.beforeApply` hook for changes that arrive as raw applies.

Command names are frozen API. Async command handlers are not permitted: an async flow dispatches a command that starts the work and applies later with a structured origin. Command palettes and menu models stay with the host; commands are the invocation layer. Undo grouping stays origin-driven and is not a per-command concern.

## K — Keymap

- K1. The key handler resolves the `pen.keymap` facet, matches bindings in facet order, and dispatches; the first successful dispatch calls `preventDefault` and stops. When no binding handles a key, the browser default is allowed only for keys in the input allowlist — printable input, which flows through `beforeinput` — and every unhandled selection or navigation key is still prevented, so no keyboard-originated `selectionchange` reaches the reader.
- K2. The default keymap in `packages/core/src/commands/defaultKeymap.ts` is normative, platform-conditional entries included: arrows with and without `Shift`; platform word and line modifiers (macOS `Alt-Arrow` for word and `Cmd-Arrow` for line and document, Windows and Linux `Ctrl-Arrow` for word and `Ctrl-Home`/`Ctrl-End` for document); `Home` and `End` bound on every platform, because Mac keyboards that have the keys send them and leaving them unbound moves nothing; `Backspace` and `Delete` with and without word modifiers; `Enter` and `Shift-Enter`; `Tab` and `Shift-Tab`; `Mod-a`; `Mod-b`, `Mod-i`, `Mod-u`; and the undo and redo bindings.
- K3. Undo, redo, and select-all are plain bindings at `default` precedence, overridable like every other binding. There are no `isUndoShortcut`-style predicates and no history-override interception in the key path.
- K4. During IME composition the keymap is bypassed except for `Escape` (see C1 in `spec/rules/selection.md`).

A binding carries a key string, a command, an optional param or param factory, and a binding context (`text`, `cell`, `block`, or `any`, defaulting to `text`).

## B — Input events

- B1. Every non-composition `beforeinput` policy row ends in `preventDefault`, and the `inputType` table is exhaustive: an unlisted `inputType` hits the block policy, which prevents the default and emits an `unhandled-input-type` diagnostic, so a new browser behavior surfaces loudly instead of falling through to mutation-observer reconciliation. The contenteditable backend's `MutationObserver` is a watchdog only — it reports `dom-divergence` and requests a full field reconcile from the model, and never applies text diffs as ops.
- B2. The EditContext backend maps `textupdate` events into `pen.insertText` dispatches with target ranges: the same command path, a different sensor.

Composition input types (`insertCompositionText`, `insertFromComposition`, `deleteByComposition`, `deleteCompositionText`) are allowed through, because composition owns the field until it ends (C1–C4 in `spec/rules/selection.md`). Paste and drop route through the `pen.clipboard` facet before reaching `pen.insertText`.
