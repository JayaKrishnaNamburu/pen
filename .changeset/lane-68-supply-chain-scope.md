---
---

Scope the supply-chain production audit to published packages and name the sanitizer-graph advisories that keep the gate staged.

Root `pnpm audit --prod` cannot filter workspaces, so it presented playground `ws` and examples/vue `postcss`/`nanoid` as if they shipped. The check now fails only on install paths that start at a package without `"private": true`. `continue-on-error` stays until `undici` 7.22.0 and `dompurify` 3.3.2 leave that graph; the comment names the GHSAs and the flip.
