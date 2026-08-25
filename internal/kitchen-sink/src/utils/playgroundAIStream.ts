import type { PlaygroundStreamChunk } from "./playgroundAISessionTypes";

export async function* readPlaygroundAIStream(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncIterable<PlaygroundStreamChunk> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let completed = false;
	let cancelPromise: Promise<void> | null = null;

	const cancelReader = () => {
		if (cancelPromise) {
			return cancelPromise;
		}
		cancelPromise = reader.cancel(signal?.reason).catch(() => {});
		return cancelPromise;
	};

	const handleAbort = () => {
		void cancelReader();
	};

	if (signal) {
		if (signal.aborted) {
			await cancelReader();
		} else {
			signal.addEventListener("abort", handleAbort, { once: true });
		}
	}

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				completed = true;
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmedLine = line.trim();
				if (!trimmedLine) {
					continue;
				}

				yield JSON.parse(trimmedLine) as PlaygroundStreamChunk;
			}
		}

		const trailingLine = buffer.trim();
		if (trailingLine) {
			yield JSON.parse(trailingLine) as PlaygroundStreamChunk;
		}
	} finally {
		signal?.removeEventListener("abort", handleAbort);
		if (!completed) {
			await cancelReader();
		}
		reader.releaseLock();
	}
}
