const AI_AUTOCOMPLETE_LOG_PREFIX = "[ai-autocomplete]";
const AUTOCOMPLETE_DEBUG_ENABLED =
	typeof globalThis === "object" &&
	"process" in globalThis &&
	(
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env?.PEN_AUTOCOMPLETE_DEBUG === "true";

export function logAutocompleteEvent(message: string, details?: unknown): void {
	if (!AUTOCOMPLETE_DEBUG_ENABLED) {
		return;
	}
	if (details === undefined) {
		console.log(`${AI_AUTOCOMPLETE_LOG_PREFIX} ${message}`);
		return;
	}
	console.log(`${AI_AUTOCOMPLETE_LOG_PREFIX} ${message}`, details);
}

export function previewAutocompleteTextForLog(text: string): string {
	return JSON.stringify(
		text.length > 160 ? `${text.slice(0, 160)}...` : text,
	);
}
