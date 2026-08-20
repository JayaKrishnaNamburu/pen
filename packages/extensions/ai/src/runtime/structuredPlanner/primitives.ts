import type { Position } from "@input/pen-types";

export function normalizeConfidence(value: unknown): unknown {
	if (isFiniteNumber(value)) {
		return { score: value };
	}
	return value;
}

export function extractJsonObject(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
	return extractBalancedJsonObject(candidate);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function readStringField(value: string, fieldName: string): string | null {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "m"),
	);
	if (!fieldMatch?.[1]) {
		return null;
	}
	try {
		return JSON.parse(`"${fieldMatch[1]}"`) as string;
	} catch {
		// unescape failed; keep the raw captured field.
		return fieldMatch[1];
	}
}

export function readPartialObjectArray(value: string, fieldName: string): unknown[] {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\[`, "m"),
	);
	if (!fieldMatch || fieldMatch.index == null) {
		return [];
	}

	const arrayStart = fieldMatch.index + fieldMatch[0].length - 1;
	return readBalancedObjectsFromArray(value.slice(arrayStart));
}

export function readObjectField(value: string, fieldName: string): unknown | null {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`, "m"),
	);
	if (!fieldMatch || fieldMatch.index == null) {
		return null;
	}

	const objectStart = fieldMatch.index + fieldMatch[0].length - 1;
	const objectText = extractBalancedJsonObject(value.slice(objectStart));
	if (!objectText) {
		return null;
	}
	try {
		return JSON.parse(objectText) as unknown;
	} catch {
		// partial object json was unreadable.
		return null;
	}
}

export function readPositionField(
	value: string,
	fieldName: string,
): Position | null {
	const stringValue = readStringField(value, fieldName);
	if (stringValue === "first" || stringValue === "last") {
		return stringValue;
	}

	const objectValue = readObjectField(value, fieldName);
	if (!isRecordValue(objectValue)) {
		return null;
	}
	if (typeof objectValue.before === "string" && objectValue.before.length > 0) {
		return { before: objectValue.before };
	}
	if (typeof objectValue.after === "string" && objectValue.after.length > 0) {
		return { after: objectValue.after };
	}
	if (
		typeof objectValue.parent === "string" &&
		objectValue.parent.length > 0 &&
		typeof objectValue.index === "number"
	) {
		return { parent: objectValue.parent, index: objectValue.index };
	}
	return null;
}

export function readBalancedObjectsFromArray(value: string): unknown[] {
	const parsedValues: unknown[] = [];
	let depth = 0;
	let inString = false;
	let isEscaped = false;
	let objectStart = -1;

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]!;
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (character === "\\") {
			isEscaped = true;
			continue;
		}
		if (character === "\"") {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (character === "{") {
			if (depth === 0) {
				objectStart = index;
			}
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0 && objectStart >= 0) {
				const objectText = value.slice(objectStart, index + 1);
				try {
					parsedValues.push(JSON.parse(objectText) as unknown);
				} catch {
					// stop at the first unreadable array object.
					return parsedValues;
				}
				objectStart = -1;
			}
		}
	}

	return parsedValues;
}

export function extractBalancedJsonObject(value: string): string | null {
	const startIndex = value.indexOf("{");
	if (startIndex === -1) {
		return null;
	}

	let depth = 0;
	let inString = false;
	let isEscaped = false;
	for (let index = startIndex; index < value.length; index += 1) {
		const character = value[index]!;
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (character === "\\") {
			isEscaped = true;
			continue;
		}
		if (character === "\"") {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (character === "{") {
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0) {
				return value.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
