# Hostile corpus (Wave S.0 / SEC1–SEC5)

Committed attacker inputs for paste, import, collaborative injection, and JSON ingest.
Payloads call `window.__xssProbe()` when they execute. The harness installs that canary.

| File | Vectors |
| --- | --- |
| `urls.html` | `javascript:` / `vbscript:` / mixed-case / whitespace-obfuscated / `data:text/html` |
| `event-handlers.html` | `onclick` / `onerror` / `onmouseover` |
| `attribute-breakout.html` | F18 `href` / `color` / `lang` breakout strings |
| `mxss.html` | `<svg>` / `<math>` mutation-XSS |
| `css-expression.html` | `expression()` / `url(javascript:)` |
| `malformed.html` | nested / broken markup around a live URL |
| `proto-keys.json` | `__proto__` / `constructor` / `prototype` own keys |
| `vectors.ts` | same strings plus oversized depth/count builders and the SEC6 tool-payload JSON (not committed as 10k-node JSON) |
