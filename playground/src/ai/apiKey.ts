const STORAGE_KEY = "pen.playground.anthropicApiKey";

/**
 * Browser-saved key, if the person entered one in the agent menu.
 *
 * `?model=scripted` withholds it for the session, which is how you exercise
 * the offline model — and anything it is the only free way to watch, like the
 * streaming preview — without clearing a key you would have to paste back.
 */
export function getStoredAnthropicKey(): string | undefined {
	if (
		new URLSearchParams(window.location.search).get("model") === "scripted"
	) {
		return undefined;
	}
	const value = localStorage.getItem(STORAGE_KEY)?.trim();
	return value && value.length > 0 ? value : undefined;
}

export function setStoredAnthropicKey(key: string | null): void {
	if (key === null || key.trim().length === 0) {
		localStorage.removeItem(STORAGE_KEY);
		return;
	}
	localStorage.setItem(STORAGE_KEY, key.trim());
}
