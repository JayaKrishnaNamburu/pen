import type {
	ApplyOptions,
	MutationGroupMetadata,
	OpOrigin,
} from "@input/pen-types";

export function getOpOriginType(origin: OpOrigin): string {
	return typeof origin === "string" ? origin : origin.type;
}

export function getOpOriginGroupId(origin: OpOrigin): string | undefined {
	return typeof origin === "string" ? undefined : origin.groupId;
}

export function getApplyOptionsGroupId(
	origin: OpOrigin,
	options?: Pick<ApplyOptions, "groupId" | "undoGroupId">,
): string | undefined {
	return (
		options?.undoGroupId ?? options?.groupId ?? getOpOriginGroupId(origin)
	);
}

export function createMutationGroupMetadata(
	origin: OpOrigin,
	groupId: string,
): MutationGroupMetadata {
	if (typeof origin === "string") {
		return { groupId, originType: origin };
	}

	return {
		groupId,
		originType: origin.type,
		requestId: origin.requestId,
		actorId: origin.actorId,
		source: origin.source,
	};
}
