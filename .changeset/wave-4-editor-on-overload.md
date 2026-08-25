---
"@input/pen-types": minor
---

Narrow `Editor.on`'s untyped overload from `string` to the extension-namespaced pattern `` `ext:${string}:${string}` ``.

The keyed overload (`on<K extends keyof PenEventMap>`) is unchanged, and the extension state channel emitted as `ext:<name>:<event>` still resolves. What no longer compiles is a subscription to an event name that is neither: `editor.on("documentCommit", …)` and other deleted or misspelled core event names now fail with `TS2769` instead of type-checking and never firing.

Hosts subscribing with a plain `string` variable need `as keyof PenEventMap` (or a literal). Such a subscription could never receive an event, since `emit` is constrained to `keyof PenEventMap`.
