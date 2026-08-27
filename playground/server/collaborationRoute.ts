export const COLLABORATION_ROUTE = "/collaboration";
export const DEFAULT_ROOM = "pen-playground";

const ROOM_MAX_LENGTH = 64;

/**
 * Room name encoded in the y-websocket path (`/collaboration/<room>`).
 * An empty or oversized segment falls back to the default room so a bad
 * URL cannot mint an unbounded Durable Object id.
 */
export function roomFromPath(pathname: string): string {
	if (
		pathname !== COLLABORATION_ROUTE &&
		!pathname.startsWith(`${COLLABORATION_ROUTE}/`)
	) {
		return DEFAULT_ROOM;
	}

	let rest = pathname.slice(COLLABORATION_ROUTE.length).replace(/^\/+/, "");
	try {
		rest = decodeURIComponent(rest);
	} catch {
		// keep the raw segment
	}

	const room = rest.split("/")[0]?.trim() ?? "";
	if (room.length === 0 || room.length > ROOM_MAX_LENGTH) {
		return DEFAULT_ROOM;
	}
	return room;
}
