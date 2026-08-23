---
"@input/pen-multiplayer": patch
---

Stop running the HTML script heuristics over a serialized presence anchor. An
anchor is opaque transport — it is decoded by `anchors.deserialize` and never
interpolated into markup — so the heuristics had nothing to protect and misfired
on base64: an encoded position whose bytes happened to spell `on<word>=` read as
an inline event handler, dropping roughly one legitimate remote caret in 150
depending on the Yjs client id. Rendered fields keep the checks, and a
script-bearing anchor is still rejected by the structural decode.
