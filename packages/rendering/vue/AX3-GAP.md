# AX3 gap: Vue slash / command menus

`@input/pen-vue` has no slash-menu or command-menu primitives. AX3 (`spec/rules/accessibility.md`) cannot be applied here without inventing a menu. No Vue files under `src/` implement slash/command UI; the public surface is editor shell only (`PenEditor`, `PenContent`, `PenBlock`, `PenInlineContent`, `PenFieldEditor` and the matching composables).

## Missing vs React (`@input/pen-react`)

React ships the caret-anchored slash menu and the AI command palette. Vue has none of these.

### Slash menu

| React | Vue |
| --- | --- |
| `Pen.SlashMenu.Root` | missing |
| `Pen.SlashMenu.Content` | missing |
| `Pen.SlashMenu.Input` | missing |
| `Pen.SlashMenu.List` | missing |
| `Pen.SlashMenu.Group` | missing |
| `Pen.SlashMenu.Item` | missing |
| `Pen.SlashMenu.Empty` | missing |
| `useSlashMenu` / `useSlashMenuContext` | missing |

React AX3 wiring (`packages/rendering/react/src/__tests__/slashMenu.ax3.test.tsx`): listbox + option IDs, field `aria-controls` / `aria-expanded` / `aria-activedescendant`, focus stays in the field, Arrow/Home/End/Enter/Escape drive `selectedIndex`.

### AI command menu

| React | Vue |
| --- | --- |
| `Pen.AI.CommandMenu` | missing |
| `Pen.AI.CommandInput` | missing |
| `Pen.AI.CommandList` | missing |
| `Pen.AI.CommandItem` | missing |

React AX3 wiring: `role="menu"` / listbox, combobox filter with `aria-activedescendant`, Arrow/Home/End/Enter/Tab/Escape, focus stays in the filter input.

## Out of scope

No Vue slash/command primitive was added. When Vue ships these, apply AX3 on that PR — do not invent a menu to close this gap.
