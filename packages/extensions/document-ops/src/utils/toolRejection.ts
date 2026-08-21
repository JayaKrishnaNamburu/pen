import type { DiagnosticEvent, Editor } from "@input/pen-types";
import { INVALID_TOOL_PAYLOAD_CODE } from "../constants/payloadValidation";

const SOURCE = "document-ops";

export function rejectToolCall(
	editor: Editor,
	message: string,
	payload: unknown = null,
): never {
	const diagnostic: DiagnosticEvent = {
		code: INVALID_TOOL_PAYLOAD_CODE,
		level: "error",
		source: SOURCE,
		message,
		payload,
	};
	editor.internals?.emit?.("diagnostic", diagnostic);
	throw new Error(message);
}
