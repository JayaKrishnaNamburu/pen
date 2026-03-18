export const AI_SUGGESTIONS_REQUEST_MODE = "ai-suggestions";

export const DEFAULT_DEBOUNCE_MS = 1200;
export const DEFAULT_MIN_CHANGED_CHARS = 12;
export const DEFAULT_MIN_STABLE_MS = 800;
export const DEFAULT_COOLDOWN_MS = 10_000;
export const DEFAULT_MAX_SCOPE_CHARS = 320;
export const DEFAULT_MAX_SUGGESTIONS_PER_SCOPE = 3;
export const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
export const DEFAULT_DISMISS_MEMORY_MS = 10 * 60_000;
export const DEFAULT_MIN_CONFIDENCE = 0.8;
export const DEFAULT_GROUP_GAP_CHARS = 3;

export const DEFAULT_ALLOWED_BLOCK_TYPES = [
	"paragraph",
	"heading",
	"blockquote",
	"callout",
] as const;
