/**
 * The review surface's class vocabulary (RS4).
 *
 * One module names every class the review surface can put on screen, because
 * those names are a host contract rather than an implementation detail: the
 * renderer refuses inline `style` from decoration attributes (SEC2), so a
 * class is the only hook that survives to the DOM, and a host that wants to
 * theme review presentation has nothing else to hang a rule on.
 *
 * It lives in the contract layer because two packages emit these names —
 * `@input/pen-ai` from review decorations and `@input/pen-dom` when it
 * reconciles a `suggestion` mark — and neither depends on the other.
 */
export const REVIEW_SURFACE_CLASSES = Object.freeze({
	/** Inserted text in a proposed edit. */
	suggestionInsert: "pen-suggestion-insert",
	/** Deleted text in a proposed edit. */
	suggestionDelete: "pen-suggestion-delete",
	/** Marks an insertion that reads as the final text rather than a diff. */
	suggestionFinalTextChange: "pen-suggestion-final-text-change",
	/** Insertion, tagged as belonging to an AI review rather than a peer's. */
	reviewInsert: "pen-ai-review-insert",
	/** Deletion, tagged as belonging to an AI review rather than a peer's. */
	reviewDelete: "pen-ai-review-delete",
	/** Text still arriving, shown before anything is written. */
	preview: "pen-ai-review-preview",
	/** The text a still-arriving edit will replace. */
	previewOriginal: "pen-ai-review-preview-original",
	/** Selection context kept visible around an edit under review. */
	context: "pen-ai-review-context",
	/** The range an edit under review affects. */
	affectedRange: "pen-ai-affected-range",
	/** A block carrying a proposed structural change. */
	blockSuggestion: "pen-block-suggestion",
} as const);

/**
 * Per-action block-suggestion classes, enumerated rather than interpolated so
 * the vocabulary stays a closed set a host can style exhaustively and the
 * contract layer stays free of runtime (API3).
 */
export const REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES = Object.freeze({
	"insert-block": "pen-block-suggestion-insert-block",
	"delete-block": "pen-block-suggestion-delete-block",
	"move-block": "pen-block-suggestion-move-block",
	"convert-block": "pen-block-suggestion-convert-block",
	"split-block": "pen-block-suggestion-split-block",
	"format-text": "pen-block-suggestion-format-text",
} as const);

/**
 * The custom properties that theme the review surface. Hosts set these; they
 * do not re-implement the rule blocks the exported sheet already carries.
 */
export const REVIEW_SURFACE_CUSTOM_PROPERTIES = Object.freeze({
	insertColor: "--pen-ai-review-insert-color",
	insertBackground: "--pen-ai-review-insert-background",
	deleteColor: "--pen-ai-review-delete-color",
	contextBackground: "--pen-ai-review-context-background",
	contextBoxShadow: "--pen-ai-review-context-box-shadow",
	borderRadius: "--pen-ai-review-border-radius",
	inlinePaddingBlock: "--pen-ai-review-inline-padding-block",
	inlineMarginBlock: "--pen-ai-review-inline-margin-block",
} as const);
