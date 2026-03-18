export const LOCAL_OPERATION_PAYLOAD_START = "<pen_local_operation>";
export const LOCAL_OPERATION_PAYLOAD_END = "</pen_local_operation>";

type LocalOperationPayloadPreview = {
	text: string;
	changed: boolean;
};

type LocalOperationPayloadResult =
	| {
		ok: true;
		text: string;
	}
	| {
		ok: false;
		reason: string;
	};

export function createLocalOperationPayloadCollector() {
	let rawText = "";
	let previewText = "";

	return {
		push(delta: string): LocalOperationPayloadPreview {
			rawText += delta;
			const nextPreview = extractLocalOperationPayloadPreview(rawText);
			const changed = nextPreview !== previewText;
			previewText = nextPreview;
			return {
				text: previewText,
				changed,
			};
		},
		finalize(): LocalOperationPayloadResult {
			return finalizeLocalOperationPayload(rawText);
		},
	};
}

function extractLocalOperationPayloadPreview(rawText: string): string {
	const startIndex = rawText.indexOf(LOCAL_OPERATION_PAYLOAD_START);
	if (startIndex < 0) {
		return "";
	}
	const contentStart = startIndex + LOCAL_OPERATION_PAYLOAD_START.length;
	const endIndex = rawText.indexOf(LOCAL_OPERATION_PAYLOAD_END, contentStart);
	return endIndex < 0
		? trimTrailingPartialPayloadMarker(
				rawText.slice(contentStart),
				LOCAL_OPERATION_PAYLOAD_END,
			)
		: rawText.slice(contentStart, endIndex);
}

function trimTrailingPartialPayloadMarker(text: string, marker: string): string {
	const maxOverlap = Math.min(text.length, marker.length - 1);
	for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
		if (text.endsWith(marker.slice(0, overlap))) {
			return text.slice(0, -overlap);
		}
	}
	return text;
}

function finalizeLocalOperationPayload(rawText: string): LocalOperationPayloadResult {
	const startIndex = rawText.indexOf(LOCAL_OPERATION_PAYLOAD_START);
	if (startIndex < 0) {
		return {
			ok: false,
			reason:
				"The local AI operation did not return the required payload wrapper.",
		};
	}
	const contentStart = startIndex + LOCAL_OPERATION_PAYLOAD_START.length;
	const endIndex = rawText.indexOf(LOCAL_OPERATION_PAYLOAD_END, contentStart);
	if (endIndex < 0) {
		return {
			ok: false,
			reason:
				"The local AI operation ended before the payload wrapper was closed.",
		};
	}
	const leadingText = rawText.slice(0, startIndex);
	const trailingText = rawText.slice(endIndex + LOCAL_OPERATION_PAYLOAD_END.length);
	if (leadingText.trim().length > 0 || trailingText.trim().length > 0) {
		return {
			ok: false,
			reason:
				"The local AI operation returned narration outside the payload wrapper.",
		};
	}
	return {
		ok: true,
		text: rawText.slice(contentStart, endIndex),
	};
}
