const STORAGE_KEY = "pen.playground.anthropicApiKey";

/** Browser-saved key, if the person entered one in the agent menu. */
export function getStoredAnthropicKey(): string | undefined {
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
