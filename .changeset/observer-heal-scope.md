---
"@input/pen-core": patch
---

Narrow the remote sentinel heal to the EM4 strip and stop editor construction from emitting a phantom commit.

Observing a remote CRDT event ran the full normalizer, so a remote update recomputed stored props on the affected blocks. It now runs only the EM4 lone-sentinel strip, which is what the path exists for.

The document-profile write during construction landed after the observer was wired, so every editor emitted an empty commit before its first real one. Profile persistence and pending empty-block migrations now both run before observation starts. Migrations run first: persisting the profile refreshes the format stamp, which would otherwise hide a stamp-2 document from the migration check.
