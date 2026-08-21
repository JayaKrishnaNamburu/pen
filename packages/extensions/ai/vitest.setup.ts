import http from "node:http";
import https from "node:https";

const INSTALLED = Symbol.for("pen.aiSuiteNetworkGuard");

function requestUrl(input: unknown): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	if (input instanceof Request) {
		return input.url;
	}
	if (input && typeof input === "object") {
		const options = input as {
			url?: unknown;
			href?: unknown;
			protocol?: unknown;
			host?: unknown;
			hostname?: unknown;
			port?: unknown;
			path?: unknown;
		};
		if (typeof options.url === "string") {
			return options.url;
		}
		if (typeof options.href === "string") {
			return options.href;
		}
		const protocol = typeof options.protocol === "string" ? options.protocol : "";
		const host =
			typeof options.host === "string"
				? options.host
				: typeof options.hostname === "string"
					? options.hostname
					: "";
		const port =
			host.includes(":") || options.port == null ? "" : `:${String(options.port)}`;
		const path = typeof options.path === "string" ? options.path : "";
		const joined = `${protocol}//${host}${port}${path}`;
		if (joined !== "//") {
			return joined;
		}
	}
	return String(input);
}

function networkError(url: string): Error {
	return new Error(`AI suite forbids network access: ${url}`);
}

export function installAISuiteNetworkGuard(): void {
	const globalRecord = globalThis as typeof globalThis & {
		[INSTALLED]?: true;
	};
	if (globalRecord[INSTALLED]) {
		return;
	}
	globalRecord[INSTALLED] = true;

	globalThis.fetch = ((input: unknown) => {
		return Promise.reject(networkError(requestUrl(input)));
	}) as typeof fetch;

	if (typeof WebSocket === "function") {
		globalThis.WebSocket = class ForbiddenWebSocket {
			constructor(url: unknown) {
				throw networkError(requestUrl(url));
			}
		} as typeof WebSocket;
	}

	if (typeof XMLHttpRequest === "function") {
		XMLHttpRequest.prototype.open = function open(
			_method: string,
			url: string | URL,
		) {
			throw networkError(requestUrl(url));
		};
	}

	const blockNodeRequest = (...args: unknown[]) => {
		throw networkError(requestUrl(args[0]));
	};
	http.request = blockNodeRequest as typeof http.request;
	http.get = blockNodeRequest as typeof http.get;
	https.request = blockNodeRequest as typeof https.request;
	https.get = blockNodeRequest as typeof https.get;
}

installAISuiteNetworkGuard();
