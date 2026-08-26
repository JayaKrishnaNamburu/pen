import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
} from "@input/pen-types";

/**
 * The review surface's default stylesheet (RS4).
 *
 * Shipped as text rather than a `.css` file on purpose: every published
 * package declares `sideEffects: false` (API7), which lets a bundler drop a
 * bare `import "…/review.css"`, and a stylesheet that a bundler is entitled to
 * discard is not a contract. Text can be adopted deliberately —
 * `adoptedStyleSheets`, a `<style>` element, or a build step — and it is what
 * the classes in the vocabulary actually promise to look like.
 *
 * Selectors are interpolated from the vocabulary, so a renamed class cannot
 * leave the sheet pointing at a name nothing emits.
 *
 * Theme by setting the `--pen-ai-review-*` custom properties on any ancestor.
 * Do not re-implement these rule blocks: that is the drift RS4 exists to stop.
 */
export const PEN_REVIEW_STYLESHEET = `
.${REVIEW_SURFACE_CLASSES.suggestionInsert} {
	color: var(--pen-ai-review-insert-color, #6d28d9);
	background: var(--pen-ai-review-insert-background, color-mix(in srgb, #7c3aed 12%, transparent));
	padding-block: var(--pen-ai-review-inline-padding-block, 0.2em);
	margin-block: var(--pen-ai-review-inline-margin-block, -0.2em);
	border-radius: var(--pen-ai-review-border-radius, 3px);
	box-decoration-break: clone;
	-webkit-box-decoration-break: clone;
}

.${REVIEW_SURFACE_CLASSES.suggestionDelete} {
	color: var(--pen-ai-review-delete-color, #6b7280);
	text-decoration: line-through;
	text-decoration-color: var(--pen-ai-review-delete-color, #6b7280);
}

.${REVIEW_SURFACE_CLASSES.context} {
	color: inherit;
	background: var(--pen-ai-review-context-background, color-mix(in srgb, #2563eb 14%, transparent));
	box-shadow: var(--pen-ai-review-context-box-shadow, none);
	padding-block: var(--pen-ai-review-inline-padding-block, 0.2em);
	margin-block: var(--pen-ai-review-inline-margin-block, -0.2em);
	border-radius: var(--pen-ai-review-border-radius, 3px);
	box-decoration-break: clone;
	-webkit-box-decoration-break: clone;
}

/*
 * Preview text is a markdown payload flattened to lines. Without pre-wrap a
 * list previews as one long sentence.
 */
.${REVIEW_SURFACE_CLASSES.preview} {
	white-space: pre-wrap;
}

.${REVIEW_SURFACE_CLASSES.previewOriginal} {
	color: var(--pen-ai-review-delete-color, #6b7280);
	text-decoration: line-through;
	text-decoration-color: var(--pen-ai-review-delete-color, #6b7280);
}

.${REVIEW_SURFACE_CLASSES.affectedRange} {
	background: var(--pen-ai-review-context-background, color-mix(in srgb, #2563eb 14%, transparent));
	border-radius: var(--pen-ai-review-border-radius, 3px);
}

.${REVIEW_SURFACE_CLASSES.blockSuggestion} {
	border-inline-start: 2px solid var(--pen-ai-review-insert-color, #6d28d9);
	padding-inline-start: 0.5em;
}

.${REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES["delete-block"]} {
	opacity: 0.6;
	text-decoration: line-through;
	text-decoration-color: var(--pen-ai-review-delete-color, #6b7280);
}
`;
