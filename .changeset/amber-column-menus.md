---
"@input/pen-react": patch
---

Apply the AX3 detached-surface keyboard contract to the table column menu.

The column menu is now a `role="menu"` with roving tabindex and arrow-key movement. Escape closes it and restores the invoking control. Opening the menu no longer steals editor focus.
