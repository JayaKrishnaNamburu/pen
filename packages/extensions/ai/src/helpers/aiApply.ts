import type { ApplyOptions } from "@input/pen-types";

export function aiGroupedApplyOptions(
	groupId: string | undefined,
): ApplyOptions {
	if (!groupId) {
		return { origin: "ai", undoGroup: true };
	}
	return {
		origin: { type: "ai", groupId },
		groupId,
		undoGroupId: groupId,
	};
}
