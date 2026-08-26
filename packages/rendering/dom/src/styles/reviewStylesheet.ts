import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
	REVIEW_SURFACE_CUSTOM_PROPERTIES,
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
 * Selectors and theme properties are interpolated from the vocabulary, so a
 * renamed class or token cannot leave the sheet pointing at a name nothing
 * emits.
 *
 * Theme by setting the `--pen-ai-review-*` custom properties on any ancestor.
 * Do not re-implement these rule blocks: that is the drift RS4 exists to stop.
 */
export const PEN_REVIEW_STYLESHEET = `
.${REVIEW_SURFACE_CLASSES.suggestionInsert} {
	color: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.insertColor}, #6d28d9);
	background: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.insertBackground}, color-mix(in srgb, #7c3aed 12%, transparent));
	padding-block: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.inlinePaddingBlock}, 0.2em);
	margin-block: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.inlineMarginBlock}, -0.2em);
	border-radius: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.borderRadius}, 3px);
	box-decoration-break: clone;
	-webkit-box-decoration-break: clone;
}

.${REVIEW_SURFACE_CLASSES.suggestionDelete} {
	color: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.deleteColor}, #6b7280);
	text-decoration: line-through;
	text-decoration-color: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.deleteColor}, #6b7280);
}

.${REVIEW_SURFACE_CLASSES.context} {
	color: inherit;
	background: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.contextBackground}, color-mix(in srgb, #2563eb 14%, transparent));
	box-shadow: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.contextBoxShadow}, none);
	padding-block: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.inlinePaddingBlock}, 0.2em);
	margin-block: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.inlineMarginBlock}, -0.2em);
	border-radius: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.borderRadius}, 3px);
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

.${REVIEW_SURFACE_CLASSES.affectedRange} {
	background: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.contextBackground}, color-mix(in srgb, #2563eb 14%, transparent));
	border-radius: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.borderRadius}, 3px);
}

.${REVIEW_SURFACE_CLASSES.blockSuggestion} {
	border-inline-start: 2px solid var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.insertColor}, #6d28d9);
	padding-inline-start: 0.5em;
}

.${REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES["delete-block"]} {
	opacity: 0.6;
	text-decoration: line-through;
	text-decoration-color: var(${REVIEW_SURFACE_CUSTOM_PROPERTIES.deleteColor}, #6b7280);
}
`;
