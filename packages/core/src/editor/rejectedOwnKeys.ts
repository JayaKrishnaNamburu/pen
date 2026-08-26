const REJECTED_OWN_PROP_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);

export function rejectedOwnPropKeys(
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): string[] {
	if (value === null || typeof value !== "object") {
		return [];
	}
	if (seen.has(value)) {
		return [];
	}
	seen.add(value);

	if (Array.isArray(value)) {
		const found: string[] = [];
		for (const item of value) {
			found.push(...rejectedOwnPropKeys(item, seen));
		}
		return found;
	}

	const record = value as Record<string, unknown>;
	const found: string[] = [];
	for (const key of Object.keys(record)) {
		if (REJECTED_OWN_PROP_KEYS.has(key)) {
			found.push(key);
			continue;
		}
		found.push(...rejectedOwnPropKeys(record[key], seen));
	}
	return found;
}
