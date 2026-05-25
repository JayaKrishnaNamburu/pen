import type { MouseEvent } from "react";
import type { ConnectionState } from "@pen/types";

export function preventEditorBlur(event: MouseEvent<HTMLElement>) {
	event.preventDefault();
}

export function getCollaborationStatusLabel(
	connectionState: ConnectionState,
): string {
	switch (connectionState) {
		case "connected":
			return "Connected";
		case "connecting":
			return "Connecting";
		case "syncing":
			return "Syncing";
		case "error":
			return "Connection error";
		case "disconnected":
			return "Disconnected";
	}
}

export function getCollaborationStatusTone(
	connectionState: ConnectionState,
): "connected" | "pending" | "error" | "idle" {
	switch (connectionState) {
		case "connected":
			return "connected";
		case "connecting":
		case "syncing":
			return "pending";
		case "error":
			return "error";
		case "disconnected":
			return "idle";
	}
}

export function getInitials(name: string): string {
	const initials = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
	return initials || "?";
}
