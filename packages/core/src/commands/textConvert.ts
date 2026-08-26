import type { CommandResult, Editor } from "@input/pen-types";

import { collapsedAt, convertBlockOps, emitCommandDiagnostic } from "./helpers";
import type { ConvertBlockParam } from "./textParams";

export function applyConvert(
	editor: Editor,
	param: ConvertBlockParam,
): CommandResult | false {
	if (!editor.getBlock(param.blockId)) {
		return false;
	}
	if (
		!editor.schema
			.allBlocks()
			.some((schema) => schema.type === param.newType)
	) {
		emitCommandDiagnostic(editor, {
			code: "invalid-block-type",
			level: "warn",
			source: "commands",
			message: `cannot convert to unknown block type ${param.newType}`,
			blockId: param.blockId,
			newType: param.newType,
		});
		return false;
	}
	editor.apply(convertBlockOps(editor, param), { origin: "user" });
	return { selection: collapsedAt(param.blockId, 0) };
}

export function handleConvertBlock(
	editor: Editor,
	param: ConvertBlockParam,
): CommandResult | false {
	return applyConvert(editor, param);
}
