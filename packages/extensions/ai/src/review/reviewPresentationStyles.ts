export const AI_STREAMING_PREVIEW_CHAR_STAGGER_MS = 4;

export const AI_REVIEW_INLINE_STYLE = [
	"padding-block: var(--pen-ai-review-inline-padding-block, 0.2em)",
	"margin-block: var(--pen-ai-review-inline-margin-block, -0.2em)",
	"border-radius: var(--pen-ai-review-border-radius, 3px)",
	"box-decoration-break: clone",
	"-webkit-box-decoration-break: clone",
].join("; ");

export const AI_REVIEW_INSERT_STYLE = [
	"color: var(--pen-ai-review-insert-color, #6d28d9)",
	"background: var(--pen-ai-review-insert-background, color-mix(in srgb, #7c3aed 12%, transparent))",
	AI_REVIEW_INLINE_STYLE,
].join("; ");

export const AI_REVIEW_CONTEXT_STYLE = [
	"color: inherit",
	"background: var(--pen-ai-review-context-background, color-mix(in srgb, #2563eb 14%, transparent))",
	"box-shadow: var(--pen-ai-review-context-box-shadow, none)",
	AI_REVIEW_INLINE_STYLE,
].join("; ");

export function buildStreamingPreviewNewStyle(animationDelayMs = 0): string {
	return [
		AI_REVIEW_INSERT_STYLE,
		"animation: var(--pen-ai-review-preview-new-animation, none)",
		animationDelayMs > 0 ? `animation-delay: ${animationDelayMs}ms` : "",
	]
		.filter(Boolean)
		.join("; ");
}
