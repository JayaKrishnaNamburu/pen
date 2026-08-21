import {
	assignMultiplayerColor,
	normalizeMultiplayerColor,
} from "./colorAssignment";
import { MAX_PRESENCE_DISPLAY_NAME_LENGTH } from "./constants";
import type { MultiplayerUser } from "../types";

const EVENT_HANDLER_ATTRIBUTE = /^on/i;

/**
 * Build remote-presence decoration attributes. Values are assigned as
 * attribute values; nothing is interpolated into markup.
 */
export function createRemotePresenceAttributes(input: {
	className: string;
	markerName: string;
	clientId: number;
	user: MultiplayerUser;
}): Record<string, string> {
	const attributes: Record<string, string> = {};
	setPresenceAttribute(attributes, "class", input.className);
	setPresenceAttribute(attributes, input.markerName, "");
	setPresenceAttribute(
		attributes,
		"data-multiplayer-client-id",
		String(input.clientId),
	);
	setPresenceAttribute(attributes, "data-user-id", input.user.id);
	setPresenceAttribute(
		attributes,
		"data-user-name",
		capPresenceDisplayName(input.user.name),
	);
	const color = normalizeMultiplayerColor(
		input.user.color,
		assignMultiplayerColor(input.user.id),
	);
	setPresenceAttribute(attributes, "style", `--pen-multiplayer-color: ${color}`);
	return attributes;
}

export function capPresenceDisplayName(name: string): string {
	if (name.length <= MAX_PRESENCE_DISPLAY_NAME_LENGTH) {
		return name;
	}
	return name.slice(0, MAX_PRESENCE_DISPLAY_NAME_LENGTH);
}

export function setPresenceAttribute(
	attributes: Record<string, string>,
	name: string,
	value: string,
): void {
	if (!isSafePresenceAttributeName(name)) {
		return;
	}
	attributes[name] = value;
}

function isSafePresenceAttributeName(name: string): boolean {
	if (name.length === 0 || EVENT_HANDLER_ATTRIBUTE.test(name)) {
		return false;
	}
	return !name.includes("<") && !name.includes(">") && !name.includes(" ");
}
