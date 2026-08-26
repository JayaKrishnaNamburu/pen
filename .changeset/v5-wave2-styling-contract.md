---
"@input/pen-types": minor
"@input/pen-dom": minor
"@input/pen-ai": patch
---

Export the review surface's styling contract once (v5 wave 2, RS4/GATE 2.8/GATE 2.9). `@input/pen-dom` now exports `PEN_REVIEW_STYLESHEET`, and the class vocabulary it styles — `REVIEW_SURFACE_CLASSES`, `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES`, `REVIEW_SURFACE_CUSTOM_PROPERTIES` — is defined in `@input/pen-types` and re-exported from `@input/pen-dom` for convenience.

This fixes a theme seam that did not work. `@input/pen-ai` set review colors in an inline `style` attribute on its decorations, and the DOM renderer refuses `style` from decoration attributes under SEC2, so the `--pen-ai-review-*` custom properties never reached the DOM and hosts had no way to theme review presentation short of rewriting the rule blocks. The properties now live in the exported sheet, where setting them works. `AI_REVIEW_INSERT_STYLE` and `AI_REVIEW_CONTEXT_STYLE` are gone with the attribute they fed; neither was exported from a package entry point, and because the renderer dropped them, removing them changes nothing on screen.

The sheet ships as text rather than a `.css` file deliberately: every published package declares `sideEffects: false`, which entitles a bundler to drop a bare `import "…/review.css"`, and a stylesheet a bundler may discard is not a contract. Adopt it explicitly through `adoptedStyleSheets`, a `<style>` element, or a build step.

Five decoration producers previously spelled these class names as string literals — `suggestionDecorations.ts`, `streamingPreviewVirtualDecorations.ts`, `streamingPreviewDeleteDecorations.ts`, and `contextDecorations.ts` in `@input/pen-ai`, plus `reconcilerMarks.ts` in `@input/pen-dom`, which names two of them when it reconciles a `suggestion` mark. All five now read the vocabulary, so a rename cannot leave a producer and the sheet disagreeing. Emitted class names are unchanged.
