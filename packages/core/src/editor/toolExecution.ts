import { isAsyncIterable, type ToolExecutionResult } from "@input/pen-types";

export async function collectToolExecutionOutput(
	result: ToolExecutionResult,
	onPart?: (part: unknown, output: unknown) => void,
): Promise<unknown> {
	const resolved = await result;
	if (!isAsyncIterable(resolved)) {
		return resolved;
	}

	const parts: unknown[] = [];
	for await (const part of resolved) {
		parts.push(part);
		onPart?.(part, parts.length <= 1 ? parts[0] : [...parts]);
	}

	return parts.length <= 1 ? parts[0] : parts;
}
