import type { FacetProvider } from "@input/pen-types";

import { caretCommandHandlers } from "./caret";
import { historyCommandHandlers } from "./history";
import { structureCommandHandlers } from "./structure";
import { tableCommandHandlers } from "./table";
import { textCommandHandlers } from "./text";

export function builtinCommandHandlers(): FacetProvider[] {
	return [
		...caretCommandHandlers(),
		...textCommandHandlers(),
		...structureCommandHandlers(),
		...tableCommandHandlers(),
		...historyCommandHandlers(),
	];
}
