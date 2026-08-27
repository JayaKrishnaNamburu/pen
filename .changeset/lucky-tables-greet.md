---
"@input/pen-multiplayer": patch
"@input/pen-react": patch
"@input/pen-dom": patch
---

Show collaborators inside tables.

A peer editing a table was invisible. `buildLocalAwarenessState` only recognised text and block selections, so a `CellSelection` fell through to `{ cursor: null, selection: null }` and nothing was published — and nothing downstream knew cells existed either, since `RemoteSelectionState` had no cell member.

Cell selections now travel as `{ kind: "cell", blockId, anchor, head, clock }` with `{ row, col }` endpoints and no cursor: a grid cell is the smallest region this presence names, so there is no caret to place, and coordinates rather than anchors match AS3's structural treatment of the local cell selection. COL2 validates them against the live grid — a cell on a block that holds no grid, or a row or column outside it, is rejected at ingest with the new `out-of-range-cell` reason — and resolve re-reads the grid on every commit so a peer whose rows were deleted under them clamps onto a live cell instead of vanishing.

`@input/pen-react`'s table renderer marks the occupied cells with `data-pen-multiplayer-cell-selection`, the peer's head cell with `data-pen-multiplayer-cell-head`, and sets the caret overlay's `--pen-peer-color` on each. Because these come from the renderer rather than a presence decoration, they can carry a colour at all: SEC2 drops `style` from decoration attributes, so presence decorations emit none and every other surface is coloured from `data-user-id`. Hosts rendering their own grid can resolve the same mapping with `resolveRemoteCellPresence`, new on `@input/pen-dom/utils/remoteCellSelection` and re-exported from `@input/pen-react`.

Both `RemoteSelectionState` and `PresenceRejectionReason` gain a member, so an exhaustive `switch` over either needs a new arm.
