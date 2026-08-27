---
"@input/pen-react": patch
"@input/pen-multiplayer": patch
---

Fix a collaboration crash where a peer's block selection unmounted the editor.

`mergeBlockDecorationAttributes` in `@input/pen-react` turned a block decoration's attribute bag into props on the block host without the SEC2 skip that `applyElementAttributes` applies to inline decorations. `@input/pen-multiplayer` puts a `style` attribute on remote presence decorations, so a peer selecting a block sent a CSS string into a React `style` prop and React threw out of the commit phase, taking the editor's root with it. The React helper now skips `/^on/i`, `style`, and `dangerouslySetInnerHTML`, the last of which crashed the same way and is a markup sink only a React prop can reach. Dropping `style` also keeps RI1's `unicode-bidi: isolate` on the block host. `createRemotePresenceAttributes` no longer emits the `style` attribute that every conforming renderer discarded: style presence through `data-user-id`, and peer caret colour still comes from `RemoteCursorState.user.color`.
