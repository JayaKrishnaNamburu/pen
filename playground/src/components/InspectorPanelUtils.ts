export function formatBlockTypeList(
	blockTypes: readonly string[] | undefined,
): string {
	return blockTypes?.join(", ") ?? "";
}

export function formatToggleValue(value: boolean | undefined): string {
	return value ? "Allowed" : "Blocked";
}

export function parseBlockTypeList(value: string): string[] | undefined {
	const blockTypes = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return blockTypes.length > 0 ? blockTypes : undefined;
}

export function formatConfidence(value: number): string {
	return `${Math.round(value * 100)}%`;
}
