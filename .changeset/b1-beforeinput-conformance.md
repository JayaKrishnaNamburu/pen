---
---

Wave 4 step 4.4's beforeinput exhaustiveness suite now lives in the conformance harness. Every `inputType` is taken from `BEFOREINPUT_MAP` itself, an unknown type must emit `unhandled-input-type` and leave the document byte-identical, and real typing asserts `dom-divergence` is silent on Chromium, WebKit, and Firefox.
