---
"@input/pen-react": patch
---

Apply the AX3 keyboard contract to the React AI command menu.

The menu is a `role="menu"` surface with a `role="listbox"` of options. While commands exist, `aria-activedescendant` tracks the active option. Arrow/Home/End move it, Enter/Tab run it, and Escape closes the menu. Focus stays in the filter input.
