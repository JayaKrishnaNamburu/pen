# SEC8 host CSP checklist

Pen must stay fully functional under:

```http
Content-Security-Policy: script-src 'self'; style-src 'self'
```

See `spec/rules/security.md` SEC8. Automated smoke:
`scenarios/sec8-csp-smoke.spec.ts` (production-shaped fixture page).

## Why not the live Vite harness

Do not apply this CSP to `packages/tooling/conformance/harness` (or any
`vite` + `@vitejs/plugin-react` dev server). Plugin-react injects an
**inline** Refresh preamble (`/@react-refresh`, `$RefreshReg$`).
`script-src 'self'` blocks that script, so the app never boots.

Vite dev also injects CSS as `<style>` tags, which `style-src 'self'`
blocks. A production host serves extracted `.js` / `.css` files from the
same origin — that is the shape the smoke fixture models.

Use a production build (`vite build` + `vite preview`, or your bundler's
equivalent). Do not use `vite dev` as the CSP host.

## What works

- Same-origin scripts. Pen executes no `eval` / `new Function` / string
  timers (lint: `no-eval`, `no-new-func`, `no-implied-eval`).
- Same-origin stylesheets. Library chrome that is not overlay geometry is
  class-based (or custom properties).
- Typing, selection, paste, and the rest of the editing surface.

Do not add `'unsafe-inline'` or `'unsafe-eval'` to `script-src` for Pen.

## What degrades

Inline `style` attributes are used only for geometry-derived overlay
positioning (`transform` on caret / selection / presence items). Without
`'unsafe-inline'` on `style-src`, those attributes are ignored:

- overlay carets may not sit on the glyph
- remote-caret labels and selection outlines may not paint at the measured
  rect
- the editing surface itself still works (native caret inside the active
  field)

If the host needs overlay geometry, add `'unsafe-inline'` to **`style-src`
only** (or accept the degrade). Hashes cannot cover runtime `style`
attributes.

## Checklist

Run against a **production-built** host (playground preview, `examples/react`,
`examples/vue`, or the product app). Record host, browser, and CSP header.

- [ ] Response (or meta) CSP is exactly `script-src 'self'; style-src 'self'`
      for this pass — or the host's policy is a strict subset (no extra
      script/`eval` exceptions for Pen).
- [ ] The page is a production bundle: view-source has no inline
      `$RefreshReg$` / `injectIntoGlobalHook` / `/@react-refresh`.
- [ ] The editor surface mounts, accepts focus, and types a character.
- [ ] Class-based chrome (surface, blocks) still paints.
- [ ] Browser console has **no** `script-src` violations from Pen packages.
- [ ] Overlay items (`data-pen-overlay-item`, editor/multiplayer caret
      overlays) either lack geometry (expected) or the host has documented
      `style-src 'unsafe-inline'` for overlays.
- [ ] A collapsed caret next to an atom / a remote caret (if mounted) shows
      the degrade: native field caret still works; overlay caret is
      unpositioned or absent.

Fail the pass if the surface does not boot, if Pen scripts need
`'unsafe-eval'` / inline script, or if anything other than overlay
geometry is lost under this CSP.
