import type { TestEditor } from "./types";

export type AssertPeerEditsSurviveOptions = {
	blockId: string;
	tokens: readonly string[];
};

/**
 * Pins "every named peer edit is present on every editor".
 * `assertDocEquals` cannot tell convergence from mutual loss.
 */
export function assertPeerEditsSurvive(
	editors: readonly TestEditor[],
	options: AssertPeerEditsSurviveOptions,
): void {
	if (editors.length < 2) {
		throw new Error(
			"assertPeerEditsSurvive requires at least two editors",
		);
	}
	if (new Set(editors).size !== editors.length) {
		throw new Error(
			"assertPeerEditsSurvive requires distinct editors",
		);
	}
	if (options.tokens.length < 2) {
		throw new Error(
			"assertPeerEditsSurvive requires at least two tokens",
		);
	}

	const texts = editors.map((editor) =>
		editor.getBlock(options.blockId).textContent(),
	);

	for (let index = 0; index < texts.length; index++) {
		const text = texts[index]!;
		for (const token of options.tokens) {
			if (!text.includes(token)) {
				throw new Error(
					`Peer ${index} is missing edit ${JSON.stringify(token)} in block ${options.blockId}. texts=${JSON.stringify(texts)}`,
				);
			}
		}
	}
}
