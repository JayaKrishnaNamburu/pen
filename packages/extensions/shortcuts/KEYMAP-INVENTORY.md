# @input/pen-shortcuts — Wave 4 named-command map

Inventory for the built-in catalog inventory. Not a keymap rewrite. Wave 3/4 gates are not closed. Do not convert this package to `pen.keymap` facet providers here (Wave 1 owns the facet; 4.3 conversion happens when those gates close).

Current bindings: `src/richTextShortcutsExtension.ts` (`buildKeyBindings`).
Future names: `spec/rules/commands.md` catalog, K2 default keymap, and beforeinput table.

## Current key → future command

| Current key | Current handler | Future command | Notes |
| --- | --- | --- | --- |
| `Mod-b` | `toggleInlineMark(editor, "bold")` | `pen.toggleMark` | param `{ mark: "bold" }`. Shipped default; host may replace the key list or set `bindings.bold` to `null`. |
| `Mod-i` | `toggleInlineMark(editor, "italic")` | `pen.toggleMark` | param `{ mark: "italic" }`. Same override rule. |
| `Mod-u` | `toggleInlineMark(editor, "underline")` | `pen.toggleMark` | param `{ mark: "underline" }`. Same override rule. |
| `Mod-k` | `options.onToggleLink(editor)` | unmapped | Emitted only when `onToggleLink` is set. Host callback; the catalog has no link command. |

Unmapped count: **1** (`Mod-k`).

Host-replaced keys for bold / italic / underline stay `pen.toggleMark` (not extra rows). Nulling a mark drops that binding.

`setInlineMark` is exported and is not bound to any key.

## Overlap with the core default keymap (K2)

`spec/rules/commands.md` K2 lists `Mod-b/i/u` on the core default keymap (`core/src/commands/defaultKeymap.ts`, not written yet). This package already ships those three keys. 4.3 conversion must not register the same binding twice.

## Step 4.4 (beforeinput)

This package has no beforeinput handlers (0 rows).

The 4.4 map in `05-commands.md` dispatches the same marks from pen-dom, independently of this extension:

| inputType | Future command |
| --- | --- |
| `formatBold` | `pen.toggleMark` |
| `formatItalic` | `pen.toggleMark` |
| `formatUnderline` | `pen.toggleMark` |

## Out of this package

Caret, history, select-all, delete, enter, tab, and table bindings live in pen-dom today and become core default keymap / beforeinput rows in 4.3–4.4. They are not `@input/pen-shortcuts` bindings.

## Conversion status

- Still v1 `Extension.keyBindings` (priority `100`).
- Data-only `shortcutsToKeymapProviders` maps `Mod-b` / `Mod-i` / `Mod-u` to `{ facetName: "pen.keymap", commandName: "pen.toggleMark", mark, precedence: "default" }`. Does not call `editor.facet`.
- `Mod-k` remains unmapped (count: 1).
- `toggleInlineMark` still lives here; `05-commands.md` moves it to the `pen.toggleMark` default handler in 4.2.
- Facet-provider registration is 4.3 after Wave 1 `pen.keymap` exists.

