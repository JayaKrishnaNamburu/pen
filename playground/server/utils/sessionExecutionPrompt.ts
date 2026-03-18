export interface ParsedSessionExecutionPrompt {
	latestPrompt: string;
	previousPrompts: string[];
}

const SESSION_PROMPT_HISTORY_HEADER = "Earlier user requests in this same session:\n";
const SESSION_PROMPT_LATEST_HEADER = "\nLatest request:\n";
const SESSION_PROMPT_INTROS = new Set([
	"You are continuing an existing inline editor edit session.",
	"You are continuing an existing editor chat session.",
]);

export function parseSessionExecutionPrompt(
	prompt: string,
): ParsedSessionExecutionPrompt | null {
	const normalizedPrompt = prompt.replace(/\r\n?/g, "\n").trim();
	const historyHeaderIndex = normalizedPrompt.indexOf(SESSION_PROMPT_HISTORY_HEADER);
	const latestHeaderIndex = normalizedPrompt.indexOf(SESSION_PROMPT_LATEST_HEADER);
	if (
		historyHeaderIndex < 0 ||
		latestHeaderIndex < 0 ||
		latestHeaderIndex <= historyHeaderIndex
	) {
		return null;
	}

	const intro = normalizedPrompt.slice(0, historyHeaderIndex).trim();
	if (!SESSION_PROMPT_INTROS.has(intro)) {
		return null;
	}

	const historyAndInstruction = normalizedPrompt.slice(
		historyHeaderIndex + SESSION_PROMPT_HISTORY_HEADER.length,
		latestHeaderIndex,
	);
	const historySection = historyAndInstruction.split("\n\n")[0]?.trim() ?? "";
	const latestPrompt = normalizedPrompt
		.slice(latestHeaderIndex + SESSION_PROMPT_LATEST_HEADER.length)
		.trim();
	if (!historySection || !latestPrompt) {
		return null;
	}

	const previousPrompts = Array.from(
		historySection.matchAll(/(?:^|\n)\d+\.\s([\s\S]*?)(?=(?:\n\d+\.\s)|$)/g),
	)
		.map((match) => match[1]?.trim() ?? "")
		.filter((item) => item.length > 0);
	if (previousPrompts.length === 0) {
		return null;
	}

	return {
		latestPrompt,
		previousPrompts,
	};
}
